'use client';

import { useState, useEffect, useCallback } from 'react';
import { vaultApi, connectionApi } from '../../../lib/api';
import { toast } from 'react-toastify';

interface Vault {
  id: string;
  vaultId: string;
  docId: string;
  ownerId?: string;
  storageUri?: string;
  metadata?: {
    filename?: string;
    mimeType?: string;
    size?: number;
    description?: string;
  };
  createdAt: string;
  updatedAt?: string;
}

interface Connection {
  id: string;
  theirLabel?: string;
  state: string;
}

export default function VaultsPage() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null);

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPassphrase, setUploadPassphrase] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploading, setUploading] = useState(false);

  // Open form state
  const [openPassphrase, setOpenPassphrase] = useState('');
  const [opening, setOpening] = useState(false);
  const [decryptedData, setDecryptedData] = useState<{ data: string; metadata: any } | null>(null);

  // Share form state
  const [shareConnectionId, setShareConnectionId] = useState('');
  const [sharing, setSharing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [vaultsRes, connectionsRes] = await Promise.all([
        vaultApi.getAll(),
        connectionApi.getAll(),
      ]);

      if (vaultsRes.success) {
        setVaults(vaultsRes.vaults || []);
      }

      if (connectionsRes.success) {
        const activeConnections = (connectionsRes.connections || []).filter(
          (c: Connection) => c.state === 'completed' || c.state === 'response-sent'
        );
        setConnections(activeConnections);
      }
    } catch (error: any) {
      console.error('Failed to load vault data:', error);
      toast.error('Failed to load vaults');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpload = async () => {
    if (!uploadFile || !uploadPassphrase) {
      toast.error('Please select a file and enter a passphrase');
      return;
    }

    setUploading(true);
    try {
      const response = await vaultApi.create(uploadFile, uploadPassphrase, uploadDescription);
      if (response.success) {
        toast.success('Vault created successfully!');
        setShowUploadModal(false);
        setUploadFile(null);
        setUploadPassphrase('');
        setUploadDescription('');
        loadData();
      }
    } catch (error: any) {
      console.error('Failed to create vault:', error);
      toast.error(error.message || 'Failed to create vault');
    } finally {
      setUploading(false);
    }
  };

  const handleOpen = async () => {
    if (!selectedVault || !openPassphrase) {
      toast.error('Please enter a passphrase');
      return;
    }

    setOpening(true);
    try {
      const response = await vaultApi.open(selectedVault.vaultId, openPassphrase);
      if (response.success) {
        setDecryptedData({
          data: response.data,
          metadata: response.metadata,
        });
        toast.success('Vault decrypted successfully!');
      }
    } catch (error: any) {
      console.error('Failed to open vault:', error);
      toast.error(error.message || 'Failed to decrypt vault');
    } finally {
      setOpening(false);
    }
  };

  const handleDownload = () => {
    if (!decryptedData || !selectedVault) return;

    try {
      // Decode base64 data
      const binaryString = atob(decryptedData.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Create blob and download
      const mimeType = decryptedData.metadata?.mimeType || 'application/octet-stream';
      const blob = new Blob([bytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = decryptedData.metadata?.filename || 'vault-file';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('File downloaded!');
    } catch (error) {
      console.error('Failed to download file:', error);
      toast.error('Failed to download file');
    }
  };

  const handleShare = async () => {
    if (!selectedVault || !shareConnectionId) {
      toast.error('Please select a connection');
      return;
    }

    setSharing(true);
    try {
      const response = await vaultApi.share(selectedVault.vaultId, shareConnectionId);
      if (response.success) {
        toast.success('Vault shared successfully!');
        setShowShareModal(false);
        setShareConnectionId('');
      }
    } catch (error: any) {
      console.error('Failed to share vault:', error);
      toast.error(error.message || 'Failed to share vault');
    } finally {
      setSharing(false);
    }
  };

  const handleDelete = async (vault: Vault) => {
    if (!confirm('Are you sure you want to delete this vault?')) return;

    try {
      const response = await vaultApi.delete(vault.vaultId);
      if (response.success) {
        toast.success('Vault deleted successfully');
        loadData();
      }
    } catch (error: any) {
      console.error('Failed to delete vault:', error);
      toast.error(error.message || 'Failed to delete vault');
    }
  };

  const formatFileSize = (bytes: number | undefined) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Encrypted Vaults</h1>
          <p className="page-sub">Secure storage for your files with end-to-end encryption.</p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="btn btn-primary"
        >
          + Create Vault
        </button>
      </div>

      {/* Vaults List */}
      {vaults.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="22" height="22"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg></div>
          <div className="empty-title">No vaults yet</div>
          <div className="empty-desc">Create your first encrypted vault to securely store files.</div>
          <div className="empty-actions">
            <button onClick={() => setShowUploadModal(true)} className="btn btn-primary">+ Create Vault</button>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-border-secondary">
            {vaults.map((vault) => (
              <div
                key={vault.id}
                className="px-6 py-4 hover:bg-surface-100 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <svg className="h-8 w-8 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <div>
                        <div className="text-sm font-medium text-text-primary">
                          {vault.metadata?.filename || 'Unnamed Vault'}
                        </div>
                        <div className="text-xs text-text-tertiary">
                          {vault.metadata?.mimeType || 'Unknown type'} &bull; {formatFileSize(vault.metadata?.size)}
                        </div>
                      </div>
                    </div>

                    {vault.metadata?.description && (
                      <p className="text-sm text-text-secondary mb-2">{vault.metadata.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-text-tertiary">
                      <span>Vault ID: {vault.vaultId.substring(0, 12)}...</span>
                      <span>Created: {new Date(vault.createdAt).toLocaleDateString()}</span>
                      {vault.storageUri && (
                        <span className="badge badge-primary">External Storage</span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => {
                        setSelectedVault(vault);
                        setShowOpenModal(true);
                        setDecryptedData(null);
                        setOpenPassphrase('');
                      }}
                      className="btn btn-sm btn-primary"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => {
                        setSelectedVault(vault);
                        setShowShareModal(true);
                        setShareConnectionId('');
                      }}
                      className="btn btn-sm btn-secondary"
                    >
                      Share
                    </button>
                    <button
                      onClick={() => handleDelete(vault)}
                      className="btn btn-sm bg-error-600 hover:bg-error-700 text-white"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal-backdrop">
          <div className="modal-container max-w-md">
            <div className="px-6 py-4 border-b border-border-primary">
              <h3 className="text-lg font-semibold text-text-primary">Create Encrypted Vault</h3>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="form-label">File</label>
                <input
                  type="file"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="form-label">Passphrase</label>
                <input
                  type="password"
                  value={uploadPassphrase}
                  onChange={(e) => setUploadPassphrase(e.target.value)}
                  placeholder="Enter a strong passphrase"
                  className="input w-full"
                />
                <p className="mt-1 text-xs text-text-tertiary">
                  This passphrase will be used to encrypt your file. Keep it safe!
                </p>
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
            </div>

            <div className="px-6 py-4 border-t border-border-primary flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadFile(null);
                  setUploadPassphrase('');
                  setUploadDescription('');
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!uploadFile || !uploadPassphrase || uploading}
                className="btn btn-primary"
              >
                {uploading ? 'Encrypting...' : 'Create Vault'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Open Modal */}
      {showOpenModal && selectedVault && (
        <div className="modal-backdrop">
          <div className="modal-container max-w-lg">
            <div className="px-6 py-4 border-b border-border-primary">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">Open Vault</h3>
                  <p className="text-sm text-text-tertiary">{selectedVault.metadata?.filename || 'Unnamed Vault'}</p>
                </div>
                <button
                  onClick={() => {
                    setShowOpenModal(false);
                    setSelectedVault(null);
                    setDecryptedData(null);
                    setOpenPassphrase('');
                  }}
                  className="text-text-tertiary hover:text-text-primary"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              {!decryptedData ? (
                <>
                  <div>
                    <label className="form-label">Passphrase</label>
                    <input
                      type="password"
                      value={openPassphrase}
                      onChange={(e) => setOpenPassphrase(e.target.value)}
                      placeholder="Enter vault passphrase"
                      className="input w-full"
                    />
                  </div>

                  <button
                    onClick={handleOpen}
                    disabled={!openPassphrase || opening}
                    className="btn btn-primary w-full"
                  >
                    {opening ? 'Decrypting...' : 'Decrypt Vault'}
                  </button>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="bg-success-100 border border-success-300 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-success-700 mb-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="font-medium">Vault Decrypted Successfully</span>
                    </div>
                    <p className="text-sm text-success-600">
                      File: {decryptedData.metadata?.filename || 'Unknown'}
                    </p>
                    <p className="text-sm text-success-600">
                      Size: {formatFileSize(decryptedData.metadata?.size)}
                    </p>
                  </div>

                  <button
                    onClick={handleDownload}
                    className="btn btn-primary w-full"
                  >
                    Download File
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && selectedVault && (
        <div className="modal-backdrop">
          <div className="modal-container max-w-md">
            <div className="px-6 py-4 border-b border-border-primary">
              <h3 className="text-lg font-semibold text-text-primary">Share Vault</h3>
              <p className="text-sm text-text-tertiary">{selectedVault.metadata?.filename || 'Unnamed Vault'}</p>
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

              <div className="bg-warning-100 border border-warning-300 rounded-lg p-3">
                <p className="text-sm text-warning-800">
                  The vault will be shared via DIDComm. The recipient will receive the encrypted vault data.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border-primary flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowShareModal(false);
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
                {sharing ? 'Sharing...' : 'Share Vault'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
