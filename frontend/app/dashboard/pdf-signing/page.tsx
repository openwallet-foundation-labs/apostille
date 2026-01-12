'use client';

import { useState, useEffect, useCallback } from 'react';
import { pdfSigningApi, vaultApi, connectionApi } from '../../../lib/api';
import { toast } from 'react-toastify';
import { KeyManager, PdfSigner, StoredSigningKey } from '../../../lib/signing';

interface PdfVault {
  vaultId: string;
  filename?: string;
  description?: string;
  role?: 'owner' | 'signer';
  status?: string;
  signerConnectionId?: string;
  ownerConnectionId?: string;
  isSigned?: boolean;
  signedAt?: string;
  sharedAt?: string;
  returnedAt?: string;
  createdAt?: string;
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
  // Owner stats
  pendingToShare: number;
  awaitingSignature: number;
  signed: number;  // New: confirmed signed via session protocol
  // Signer stats
  toSign: number;
  signedToReturn: number;
  // Completed
  completed: number;
}

export default function PdfSigningPage() {
  const [status, setStatus] = useState<SigningStatus | null>(null);
  // Owner's vaults
  const [pendingToShareVaults, setPendingToShareVaults] = useState<PdfVault[]>([]);
  const [awaitingSignatureVaults, setAwaitingSignatureVaults] = useState<PdfVault[]>([]);
  const [signedVaults, setSignedVaults] = useState<PdfVault[]>([]);  // Confirmed signed via protocol
  // Signer's vaults
  const [toSignVaults, setToSignVaults] = useState<PdfVault[]>([]);
  const [signedToReturnVaults, setSignedToReturnVaults] = useState<PdfVault[]>([]);
  // Completed vaults
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
  const [signingKeys, setSigningKeys] = useState<StoredSigningKey[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [keyPassword, setKeyPassword] = useState('');
  const [signReason, setSignReason] = useState('');
  const [signLocation, setSignLocation] = useState('');
  const [signing, setSigning] = useState(false);

  // Key management within sign modal
  type KeyModalView = 'select' | 'generate' | 'import' | 'export';
  const [keyModalView, setKeyModalView] = useState<KeyModalView>('select');

  // Generate key form (inline in sign modal)
  const [genKeyName, setGenKeyName] = useState('');
  const [genKeyAlgorithm, setGenKeyAlgorithm] = useState<'RSA-2048' | 'RSA-4096' | 'ECDSA-P256'>('RSA-2048');
  const [genKeyCommonName, setGenKeyCommonName] = useState('');
  const [genKeyOrganization, setGenKeyOrganization] = useState('');
  const [genKeyEmail, setGenKeyEmail] = useState('');
  const [genKeyValidityYears, setGenKeyValidityYears] = useState(1);
  const [genKeyPassword, setGenKeyPassword] = useState('');
  const [genKeyConfirmPassword, setGenKeyConfirmPassword] = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);

  // Import key form (inline in sign modal)
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFilePassword, setImportFilePassword] = useState('');
  const [importStorePassword, setImportStorePassword] = useState('');
  const [importConfirmPassword, setImportConfirmPassword] = useState('');
  const [importKeyName, setImportKeyName] = useState('');
  const [importingKey, setImportingKey] = useState(false);

  // Export key state
  const [exportKeyPassword, setExportKeyPassword] = useState('');
  const [exportFilePassword, setExportFilePassword] = useState('');
  const [exportingKey, setExportingKey] = useState(false);

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareConnectionId, setShareConnectionId] = useState('');
  const [sharing, setSharing] = useState(false);

  // Download modal state
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Load signing keys from IndexedDB
  const loadSigningKeys = useCallback(async () => {
    try {
      const keys = await KeyManager.listKeys();
      setSigningKeys(keys);
      // Auto-select first key if available and none selected
      if (keys.length > 0 && !selectedKeyId) {
        setSelectedKeyId(keys[0].id);
      }
    } catch (error) {
      console.error('Failed to load signing keys:', error);
    }
  }, [selectedKeyId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, connectionsRes] = await Promise.all([
        pdfSigningApi.getStatus(),
        connectionApi.getAll(),
      ]);

      // Also load signing keys
      loadSigningKeys();

      if (statusRes.success) {
        setStatus(statusRes.status);
        // Owner's vaults
        setPendingToShareVaults(statusRes.vaults?.pendingToShare || []);
        setAwaitingSignatureVaults(statusRes.vaults?.awaitingSignature || []);
        setSignedVaults(statusRes.vaults?.signed || []);  // Confirmed signed via protocol
        // Signer's vaults
        setToSignVaults(statusRes.vaults?.toSign || []);
        setSignedToReturnVaults(statusRes.vaults?.signedToReturn || []);
        // Completed
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
    if (!selectedVault || !selectedKeyId || !keyPassword) {
      toast.error('Please select a signing key and enter your password');
      return;
    }

    setSigning(true);
    try {
      // Step 1: Get the signing key from IndexedDB
      toast.info('Loading signing key...');
      const signingKey = await KeyManager.getKey(selectedKeyId, keyPassword);
      if (!signingKey) {
        throw new Error('Invalid password or key not found');
      }

      // Step 2: Download the PDF from vault (decrypted via KEM keys on backend)
      toast.info('Downloading document...');
      const pdfBlob = await pdfSigningApi.download(selectedVault.vaultId);
      const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());

      // Step 3: Sign the PDF locally in the browser
      toast.info('Signing document locally...');
      const signedPdfBytes = await PdfSigner.signPdf(pdfBytes, signingKey, {
        reason: signReason || undefined,
        location: signLocation || undefined,
      });

      // Step 4: Upload the signed PDF back to the server
      toast.info('Uploading signed document...');
      const response = await pdfSigningApi.uploadSigned(
        selectedVault.vaultId,
        signedPdfBytes,
        signingKey.name
      );

      if (response.success) {
        toast.success('PDF signed successfully! Your private key never left your browser.');
        setShowSignModal(false);
        setSelectedVault(null);
        resetSignForm();
        loadData();
      }
    } catch (error: any) {
      console.error('Failed to sign PDF:', error);
      if (error.message?.includes('password') || error.message?.includes('corrupted')) {
        toast.error('Invalid password. Please check and try again.');
      } else {
        toast.error(error.message || 'Failed to sign PDF');
      }
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
        loadData(); // Reload to update vault status
      }
    } catch (error: any) {
      console.error('Failed to share PDF:', error);
      toast.error(error.message || 'Failed to share PDF');
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = async () => {
    if (!selectedVault) {
      toast.error('No vault selected');
      return;
    }

    setDownloading(true);
    try {
      //  - uses KEM keys automatically
      const blob = await pdfSigningApi.download(selectedVault.vaultId);

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
    } catch (error: any) {
      console.error('Failed to download PDF:', error);
      toast.error(error.message || 'Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  const resetSignForm = () => {
    setKeyPassword('');
    setSignReason('');
    setSignLocation('');
    setKeyModalView('select');
    resetGenerateKeyForm();
    resetImportKeyForm();
    resetExportKeyForm();
  };

  const resetGenerateKeyForm = () => {
    setGenKeyName('');
    setGenKeyAlgorithm('RSA-2048');
    setGenKeyCommonName('');
    setGenKeyOrganization('');
    setGenKeyEmail('');
    setGenKeyValidityYears(1);
    setGenKeyPassword('');
    setGenKeyConfirmPassword('');
  };

  const resetImportKeyForm = () => {
    setImportFile(null);
    setImportFilePassword('');
    setImportStorePassword('');
    setImportConfirmPassword('');
    setImportKeyName('');
  };

  const resetExportKeyForm = () => {
    setExportKeyPassword('');
    setExportFilePassword('');
  };

  // Generate key inline in sign modal
  const handleGenerateKeyInline = async () => {
    if (!genKeyName || !genKeyCommonName || !genKeyPassword) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (genKeyPassword !== genKeyConfirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (genKeyPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setGeneratingKey(true);
    try {
      const newKey = await KeyManager.generateKey(
        genKeyName,
        genKeyAlgorithm,
        {
          commonName: genKeyCommonName,
          organization: genKeyOrganization || undefined,
          email: genKeyEmail || undefined,
          validityYears: genKeyValidityYears,
        },
        genKeyPassword
      );

      toast.success('Signing key generated!');

      // Reload keys and select the new one
      await loadSigningKeys();
      setSelectedKeyId(newKey.id);
      setKeyPassword(genKeyPassword); // Auto-fill password since user just entered it

      // Go back to select view
      setKeyModalView('select');
      resetGenerateKeyForm();
    } catch (error: any) {
      console.error('Failed to generate key:', error);
      toast.error(error.message || 'Failed to generate signing key');
    } finally {
      setGeneratingKey(false);
    }
  };

  // Import key inline in sign modal
  const handleImportKeyInline = async () => {
    if (!importFile || !importFilePassword || !importStorePassword) {
      toast.error('Please provide file and passwords');
      return;
    }

    if (importStorePassword !== importConfirmPassword) {
      toast.error('Storage passwords do not match');
      return;
    }

    if (importStorePassword.length < 8) {
      toast.error('Storage password must be at least 8 characters');
      return;
    }

    setImportingKey(true);
    try {
      const importedKey = await KeyManager.importP12(
        importFile,
        importFilePassword,
        importStorePassword,
        importKeyName || undefined
      );

      toast.success('Signing key imported!');

      // Reload keys and select the imported one
      await loadSigningKeys();
      setSelectedKeyId(importedKey.id);
      setKeyPassword(importStorePassword); // Auto-fill password

      // Go back to select view
      setKeyModalView('select');
      resetImportKeyForm();
    } catch (error: any) {
      console.error('Failed to import key:', error);
      toast.error(error.message || 'Failed to import signing key. Check the file and password.');
    } finally {
      setImportingKey(false);
    }
  };

  // Export selected key
  const handleExportKeyInline = async () => {
    if (!selectedKeyId || !exportKeyPassword || !exportFilePassword) {
      toast.error('Please provide passwords');
      return;
    }

    const selectedKey = signingKeys.find(k => k.id === selectedKeyId);
    if (!selectedKey) {
      toast.error('No key selected');
      return;
    }

    setExportingKey(true);
    try {
      const blob = await KeyManager.exportP12(selectedKeyId, exportKeyPassword, exportFilePassword);

      // Download the file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedKey.name.replace(/\s+/g, '_')}.p12`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Key exported! Keep it safe.');
      setKeyModalView('select');
      resetExportKeyForm();
    } catch (error: any) {
      console.error('Failed to export key:', error);
      toast.error(error.message || 'Failed to export key. Check your password.');
    } finally {
      setExportingKey(false);
    }
  };

  // Delete selected key
  const handleDeleteKey = async () => {
    if (!selectedKeyId) return;

    const selectedKey = signingKeys.find(k => k.id === selectedKeyId);
    if (!selectedKey) return;

    if (!confirm(`Delete "${selectedKey.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await KeyManager.deleteKey(selectedKeyId);
      toast.success('Key deleted');
      setSelectedKeyId('');
      await loadSigningKeys();
    } catch (error: any) {
      console.error('Failed to delete key:', error);
      toast.error(error.message || 'Failed to delete key');
    }
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
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <div className="card p-4">
            <div className="text-2xl font-bold text-text-primary">{status.total}</div>
            <div className="text-sm text-text-secondary">Total PDFs</div>
          </div>
          <div className="card p-4 border-l-4 border-l-warning-500">
            <div className="text-2xl font-bold text-warning-600">{status.pendingToShare}</div>
            <div className="text-sm text-text-secondary">To Share</div>
            <div className="text-xs text-text-tertiary">Owner</div>
          </div>
          <div className="card p-4 border-l-4 border-l-blue-500">
            <div className="text-2xl font-bold text-blue-600">{status.awaitingSignature}</div>
            <div className="text-sm text-text-secondary">Awaiting</div>
            <div className="text-xs text-text-tertiary">Owner</div>
          </div>
          <div className="card p-4 border-l-4 border-l-green-500">
            <div className="text-2xl font-bold text-green-600">{status.signed || 0}</div>
            <div className="text-sm text-text-secondary">Signed</div>
            <div className="text-xs text-text-tertiary">Owner</div>
          </div>
          <div className="card p-4 border-l-4 border-l-orange-500">
            <div className="text-2xl font-bold text-orange-600">{status.toSign}</div>
            <div className="text-sm text-text-secondary">To Sign</div>
            <div className="text-xs text-text-tertiary">Signer</div>
          </div>
          <div className="card p-4 border-l-4 border-l-purple-500">
            <div className="text-2xl font-bold text-purple-600">{status.signedToReturn}</div>
            <div className="text-sm text-text-secondary">To Return</div>
            <div className="text-xs text-text-tertiary">Signer</div>
          </div>
          <div className="card p-4 border-l-4 border-l-success-500">
            <div className="text-2xl font-bold text-success-600">{status.completed}</div>
            <div className="text-sm text-text-secondary">Completed</div>
          </div>
        </div>
      )}

      {/* ===== OWNER SECTIONS ===== */}

      {/* Documents to Share (Owner) */}
      <div className="card">
        <div className="px-6 py-4 border-b border-border-primary flex items-center gap-2">
          <span className="px-2 py-0.5 text-xs font-medium bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400 rounded">Owner</span>
          <h2 className="text-lg font-semibold text-text-primary">Documents to Share</h2>
        </div>
        {pendingToShareVaults.length === 0 ? (
          <div className="px-6 py-8 text-center text-text-secondary">
            No documents pending to share
          </div>
        ) : (
          <div className="divide-y divide-border-secondary">
            {pendingToShareVaults.map((vault) => (
              <div key={vault.vaultId} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="h-8 w-8 text-warning-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div>
                    <div className="font-medium text-text-primary">{vault.filename || 'Unnamed PDF'}</div>
                    <div className="text-xs text-text-tertiary">
                      {vault.description && <span>{vault.description} • </span>}
                      Created: {vault.createdAt ? new Date(vault.createdAt).toLocaleDateString() : 'Unknown'}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedVault(vault);
                      setShowShareModal(true);
                    }}
                    className="btn btn-sm btn-primary"
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

      {/* Awaiting Signature (Owner) */}
      <div className="card">
        <div className="px-6 py-4 border-b border-border-primary flex items-center gap-2">
          <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">Owner</span>
          <h2 className="text-lg font-semibold text-text-primary">Awaiting Signature</h2>
        </div>
        {awaitingSignatureVaults.length === 0 ? (
          <div className="px-6 py-8 text-center text-text-secondary">
            No documents awaiting signature from others
          </div>
        ) : (
          <div className="divide-y divide-border-secondary">
            {awaitingSignatureVaults.map((vault) => (
              <div key={vault.vaultId} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="h-8 w-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <div className="font-medium text-text-primary">{vault.filename || 'Unnamed PDF'}</div>
                    <div className="text-xs text-text-tertiary">
                      {vault.description && <span>{vault.description} • </span>}
                      Shared: {vault.sharedAt ? new Date(vault.sharedAt).toLocaleDateString() : 'Unknown'}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
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

      {/* Signed Documents (Owner) - Confirmed signed via protocol */}
      <div className="card">
        <div className="px-6 py-4 border-b border-border-primary flex items-center gap-2">
          <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded">Owner</span>
          <h2 className="text-lg font-semibold text-text-primary">Signed Documents</h2>
        </div>
        {signedVaults.length === 0 ? (
          <div className="px-6 py-8 text-center text-text-secondary">
            No signed documents yet
          </div>
        ) : (
          <div className="divide-y divide-border-secondary">
            {signedVaults.map((vault) => (
              <div key={vault.vaultId} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="h-8 w-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <div className="font-medium text-text-primary">{vault.filename || 'Unnamed PDF'}</div>
                    <div className="text-xs text-text-tertiary">
                      {vault.description && <span>{vault.description} • </span>}
                      Signed: {vault.signedAt ? new Date(vault.signedAt).toLocaleDateString() : 'Recently'}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="px-2 py-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded">
                    Signature Confirmed
                  </span>
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

      {/* ===== SIGNER SECTIONS ===== */}

      {/* Documents to Sign (Signer) */}
      <div className="card">
        <div className="px-6 py-4 border-b border-border-primary flex items-center gap-2">
          <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded">Signer</span>
          <h2 className="text-lg font-semibold text-text-primary">Documents to Sign</h2>
        </div>
        {toSignVaults.length === 0 ? (
          <div className="px-6 py-8 text-center text-text-secondary">
            No documents received for signing
          </div>
        ) : (
          <div className="divide-y divide-border-secondary">
            {toSignVaults.map((vault) => (
              <div key={vault.vaultId} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="h-8 w-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  <div>
                    <div className="font-medium text-text-primary">{vault.filename || 'Unnamed PDF'}</div>
                    <div className="text-xs text-text-tertiary">
                      {vault.description && <span>{vault.description} • </span>}
                      Received: {vault.createdAt ? new Date(vault.createdAt).toLocaleDateString() : 'Unknown'}
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

      {/* Signed - Return to Owner (Signer) */}
      <div className="card">
        <div className="px-6 py-4 border-b border-border-primary flex items-center gap-2">
          <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded">Signer</span>
          <h2 className="text-lg font-semibold text-text-primary">Signed - Return to Owner</h2>
        </div>
        {signedToReturnVaults.length === 0 ? (
          <div className="px-6 py-8 text-center text-text-secondary">
            No signed documents to return
          </div>
        ) : (
          <div className="divide-y divide-border-secondary">
            {signedToReturnVaults.map((vault) => (
              <div key={vault.vaultId} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="h-8 w-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      setShowShareModal(true);
                    }}
                    className="btn btn-sm btn-primary"
                  >
                    Return to Owner
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

      {/* Sign Modal - Integrated with Key Management */}
      {showSignModal && selectedVault && (
        <div className="modal-backdrop">
          <div className="modal-container max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-border-primary">
              <h3 className="text-lg font-semibold text-text-primary">Sign PDF</h3>
              <p className="text-sm text-text-tertiary">{selectedVault.filename || 'Unnamed PDF'}</p>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Security Notice */}
              <div className="p-3 bg-success-50 dark:bg-success-900/20 rounded-md text-sm text-success-700 dark:text-success-300">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <span><strong>Client-side signing:</strong> Your private key never leaves your browser.</span>
                </div>
              </div>

              {/* Key Management Section */}
              <div className="border border-border-secondary rounded-lg overflow-hidden">
                {/* Section Header with Tabs */}
                <div className="bg-surface-50 dark:bg-surface-800 px-4 py-3 border-b border-border-secondary">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-text-primary">Signing Key</span>
                    {keyModalView === 'select' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setKeyModalView('generate')}
                          className="text-xs px-2 py-1 bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 rounded hover:bg-primary-200 dark:hover:bg-primary-900/50"
                        >
                          + Generate New
                        </button>
                        <button
                          onClick={() => setKeyModalView('import')}
                          className="text-xs px-2 py-1 bg-surface-200 text-text-secondary dark:bg-surface-700 rounded hover:bg-surface-300 dark:hover:bg-surface-600"
                        >
                          Import .p12
                        </button>
                      </div>
                    )}
                    {keyModalView !== 'select' && (
                      <button
                        onClick={() => {
                          setKeyModalView('select');
                          resetGenerateKeyForm();
                          resetImportKeyForm();
                          resetExportKeyForm();
                        }}
                        className="text-xs text-text-tertiary hover:text-text-primary"
                      >
                        ← Back to Selection
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-4">
                  {/* SELECT VIEW */}
                  {keyModalView === 'select' && (
                    <div className="space-y-4">
                      {signingKeys.length === 0 ? (
                        <div className="text-center py-6">
                          <svg className="mx-auto h-10 w-10 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </svg>
                          <p className="mt-3 text-text-secondary">No signing keys yet</p>
                          <p className="text-sm text-text-tertiary">Generate a new key or import an existing one</p>
                          <div className="mt-4 flex justify-center gap-2">
                            <button
                              onClick={() => setKeyModalView('generate')}
                              className="btn btn-sm btn-primary"
                            >
                              Generate Key
                            </button>
                            <button
                              onClick={() => setKeyModalView('import')}
                              className="btn btn-sm btn-secondary"
                            >
                              Import .p12
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <select
                              value={selectedKeyId}
                              onChange={(e) => setSelectedKeyId(e.target.value)}
                              className="input w-full"
                            >
                              <option value="">-- Select a key --</option>
                              {signingKeys.map((key) => (
                                <option key={key.id} value={key.id}>
                                  {key.name} ({key.algorithm})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Selected Key Details */}
                          {selectedKeyId && (
                            <div className="bg-surface-50 dark:bg-surface-800 rounded-lg p-3">
                              {(() => {
                                const key = signingKeys.find(k => k.id === selectedKeyId);
                                if (!key) return null;
                                const isExpired = new Date(key.expiresAt) < new Date();
                                return (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium text-text-primary">{key.name}</span>
                                      <span className={`text-xs px-2 py-0.5 rounded ${isExpired ? 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400' : 'bg-surface-200 text-text-secondary dark:bg-surface-700'}`}>
                                        {key.algorithm}
                                      </span>
                                    </div>
                                    <div className="text-xs text-text-tertiary">
                                      <div>Created: {new Date(key.createdAt).toLocaleDateString()}</div>
                                      <div className={isExpired ? 'text-error-600' : ''}>
                                        Expires: {new Date(key.expiresAt).toLocaleDateString()}
                                        {isExpired && ' (EXPIRED)'}
                                      </div>
                                    </div>
                                    <div className="flex gap-2 pt-2 border-t border-border-secondary">
                                      <button
                                        onClick={() => setKeyModalView('export')}
                                        className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400"
                                      >
                                        Export .p12
                                      </button>
                                      <button
                                        onClick={handleDeleteKey}
                                        className="text-xs text-error-600 hover:text-error-700"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}

                          {/* Key Password */}
                          <div>
                            <label className="form-label">Key Password *</label>
                            <input
                              type="password"
                              value={keyPassword}
                              onChange={(e) => setKeyPassword(e.target.value)}
                              placeholder="Enter your key password"
                              className="input w-full"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* GENERATE VIEW */}
                  {keyModalView === 'generate' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="form-label">Key Name *</label>
                          <input
                            type="text"
                            value={genKeyName}
                            onChange={(e) => setGenKeyName(e.target.value)}
                            placeholder="My Signing Key"
                            className="input w-full"
                          />
                        </div>
                        <div>
                          <label className="form-label">Algorithm</label>
                          <select
                            value={genKeyAlgorithm}
                            onChange={(e) => setGenKeyAlgorithm(e.target.value as any)}
                            className="input w-full"
                          >
                            <option value="RSA-2048">RSA-2048 (Recommended)</option>
                            <option value="RSA-4096">RSA-4096</option>
                            <option value="ECDSA-P256">ECDSA P-256</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="form-label">Your Name (Common Name) *</label>
                        <input
                          type="text"
                          value={genKeyCommonName}
                          onChange={(e) => setGenKeyCommonName(e.target.value)}
                          placeholder="John Doe"
                          className="input w-full"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="form-label">Organization</label>
                          <input
                            type="text"
                            value={genKeyOrganization}
                            onChange={(e) => setGenKeyOrganization(e.target.value)}
                            placeholder="Acme Corp (optional)"
                            className="input w-full"
                          />
                        </div>
                        <div>
                          <label className="form-label">Valid For</label>
                          <select
                            value={genKeyValidityYears}
                            onChange={(e) => setGenKeyValidityYears(parseInt(e.target.value))}
                            className="input w-full"
                          >
                            <option value={1}>1 Year</option>
                            <option value={2}>2 Years</option>
                            <option value={3}>3 Years</option>
                            <option value={5}>5 Years</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="form-label">Password *</label>
                          <input
                            type="password"
                            value={genKeyPassword}
                            onChange={(e) => setGenKeyPassword(e.target.value)}
                            placeholder="Min 8 characters"
                            className="input w-full"
                          />
                        </div>
                        <div>
                          <label className="form-label">Confirm Password *</label>
                          <input
                            type="password"
                            value={genKeyConfirmPassword}
                            onChange={(e) => setGenKeyConfirmPassword(e.target.value)}
                            placeholder="Confirm password"
                            className="input w-full"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          onClick={() => {
                            setKeyModalView('select');
                            resetGenerateKeyForm();
                          }}
                          className="btn btn-sm btn-secondary"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleGenerateKeyInline}
                          disabled={generatingKey || !genKeyName || !genKeyCommonName || !genKeyPassword || genKeyPassword !== genKeyConfirmPassword || genKeyPassword.length < 8}
                          className="btn btn-sm btn-primary"
                        >
                          {generatingKey ? 'Generating...' : 'Generate & Select'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* IMPORT VIEW */}
                  {keyModalView === 'import' && (
                    <div className="space-y-4">
                      <div>
                        <label className="form-label">PKCS#12 File (.p12 / .pfx) *</label>
                        <input
                          type="file"
                          accept=".p12,.pfx"
                          onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                          className="input w-full"
                        />
                      </div>

                      <div>
                        <label className="form-label">File Password *</label>
                        <input
                          type="password"
                          value={importFilePassword}
                          onChange={(e) => setImportFilePassword(e.target.value)}
                          placeholder="Password for the .p12 file"
                          className="input w-full"
                        />
                      </div>

                      <div>
                        <label className="form-label">Key Name (optional)</label>
                        <input
                          type="text"
                          value={importKeyName}
                          onChange={(e) => setImportKeyName(e.target.value)}
                          placeholder="Leave empty to auto-generate"
                          className="input w-full"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="form-label">Storage Password *</label>
                          <input
                            type="password"
                            value={importStorePassword}
                            onChange={(e) => setImportStorePassword(e.target.value)}
                            placeholder="Min 8 characters"
                            className="input w-full"
                          />
                        </div>
                        <div>
                          <label className="form-label">Confirm Password *</label>
                          <input
                            type="password"
                            value={importConfirmPassword}
                            onChange={(e) => setImportConfirmPassword(e.target.value)}
                            placeholder="Confirm password"
                            className="input w-full"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          onClick={() => {
                            setKeyModalView('select');
                            resetImportKeyForm();
                          }}
                          className="btn btn-sm btn-secondary"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleImportKeyInline}
                          disabled={importingKey || !importFile || !importFilePassword || !importStorePassword || importStorePassword !== importConfirmPassword || importStorePassword.length < 8}
                          className="btn btn-sm btn-primary"
                        >
                          {importingKey ? 'Importing...' : 'Import & Select'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* EXPORT VIEW */}
                  {keyModalView === 'export' && (
                    <div className="space-y-4">
                      <div className="p-3 bg-warning-50 dark:bg-warning-900/20 rounded-md text-sm text-warning-700 dark:text-warning-300">
                        <strong>Keep exported files secure!</strong> Anyone with this file and password can sign as you.
                      </div>

                      <div>
                        <label className="form-label">Your Key Password *</label>
                        <input
                          type="password"
                          value={exportKeyPassword}
                          onChange={(e) => setExportKeyPassword(e.target.value)}
                          placeholder="Password used when creating the key"
                          className="input w-full"
                        />
                      </div>

                      <div>
                        <label className="form-label">Export File Password *</label>
                        <input
                          type="password"
                          value={exportFilePassword}
                          onChange={(e) => setExportFilePassword(e.target.value)}
                          placeholder="Password to protect the exported file"
                          className="input w-full"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          onClick={() => {
                            setKeyModalView('select');
                            resetExportKeyForm();
                          }}
                          className="btn btn-sm btn-secondary"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleExportKeyInline}
                          disabled={exportingKey || !exportKeyPassword || !exportFilePassword}
                          className="btn btn-sm btn-primary"
                        >
                          {exportingKey ? 'Exporting...' : 'Download .p12'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Signature Details - only show in select view with key selected */}
              {keyModalView === 'select' && signingKeys.length > 0 && selectedKeyId && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Location (optional)</label>
                    <input
                      type="text"
                      value={signLocation}
                      onChange={(e) => setSignLocation(e.target.value)}
                      placeholder="New York, USA"
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="form-label">Reason (optional)</label>
                    <input
                      type="text"
                      value={signReason}
                      onChange={(e) => setSignReason(e.target.value)}
                      placeholder="Contract agreement"
                      className="input w-full"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
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
                disabled={keyModalView !== 'select' || !selectedKeyId || !keyPassword || signing}
                className="btn btn-primary"
              >
                {signing ? 'Signing...' : 'Sign Document'}
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
              <div className="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-md text-sm text-primary-700 dark:text-primary-300">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <span>Document will be decrypted using your KEM encryption keys. No passphrase required.</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border-primary flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDownloadModal(false);
                  setSelectedVault(null);
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDownload}
                disabled={downloading}
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
