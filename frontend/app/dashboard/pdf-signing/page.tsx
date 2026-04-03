'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { pdfSigningApi, vaultApi, connectionApi } from '../../../lib/api';
import { toast } from 'react-toastify';
import { KeyManager, PdfSigner, StoredSigningKey } from '../../../lib/signing';
import FieldPlacementEditor from '../../components/pdf-signing/FieldPlacementEditor';
import SigningGuidedView from '../../components/pdf-signing/SigningGuidedView';
import type { SigningField } from '../../components/pdf-signing/types';
import { useNotifications } from '../../context/NotificationContext';

interface SigningProgress {
  signed: number;
  required: number;
  total: number;
  signers?: { connectionId: string; isSigned: boolean }[];
}

interface PdfVault {
  vaultId: string;
  filename?: string;
  description?: string;
  role?: 'owner' | 'signer';
  status?: string;
  signerConnectionId?: string;
  ownerConnectionId?: string;
  allowSignerCopy?: boolean;
  isSigned?: boolean;
  signedAt?: string;
  sharedAt?: string;
  returnedAt?: string;
  downloadedAt?: string;
  verifiedAt?: string;
  verificationValid?: boolean;
  ownerAckAt?: string;
  ownerAckAction?: string;
  signerLocalCopy?: boolean;
  createdAt?: string;
  signingFields?: SigningField[];
  // Multi-recipient fields
  signingGroupId?: string;
  threshold?: number;
  totalSigners?: number;
  signerIndex?: number;
  signingProgress?: SigningProgress;
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
  const { notifications } = useNotifications();
  const lastNotificationIdRef = useRef<string | null>(null);
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
  const [uploadConnectionIds, setUploadConnectionIds] = useState<string[]>([]);
  const [uploadThreshold, setUploadThreshold] = useState<number>(0); // 0 = all must sign
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

  const canSignerDownload = (_vault: PdfVault) => true;

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareConnectionId, setShareConnectionId] = useState('');
  const [sharing, setSharing] = useState(false);

  // Download modal state
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Return to owner state
  const [returning, setReturning] = useState(false);

  // Verify modal state
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    hasSignature: boolean;
    valid?: boolean;
    signerName?: string;
    reason?: string;
    location?: string;
    signingTime?: string;
    error?: string;
    message?: string;
  } | null>(null);

  const parsePdfDateString = (value?: string): Date | null => {
    if (!value) return null;

    const direct = new Date(value);
    if (!Number.isNaN(direct.getTime())) return direct;

    const s = value.startsWith('D:') ? value.slice(2) : value;
    if (s.length < 4) return null;

    const year = Number(s.slice(0, 4));
    const month = Number(s.slice(4, 6) || '1');
    const day = Number(s.slice(6, 8) || '1');
    const hour = Number(s.slice(8, 10) || '0');
    const minute = Number(s.slice(10, 12) || '0');
    const second = Number(s.slice(12, 14) || '0');
    if (!year || Number.isNaN(month) || Number.isNaN(day)) return null;

    let offsetMinutes = 0;
    const tz = s.slice(14).replace(/'/g, '');
    if (tz.startsWith('+') || tz.startsWith('-')) {
      const sign = tz[0] === '+' ? 1 : -1;
      const oh = Number(tz.slice(1, 3) || '0');
      const om = Number(tz.slice(3, 5) || '0');
      if (!Number.isNaN(oh) && !Number.isNaN(om)) {
        offsetMinutes = sign * (oh * 60 + om);
      }
    }

    const utcMillis = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
    const parsed = new Date(utcMillis);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  // Field placement editor state (owner upload flow step 2)
  const [showFieldEditor, setShowFieldEditor] = useState(false);
  const [fieldEditorPdfData, setFieldEditorPdfData] = useState<ArrayBuffer | null>(null);

  // Guided signing view state (signer flow)
  const [showSigningView, setShowSigningView] = useState(false);
  const [signingPdfData, setSigningPdfData] = useState<ArrayBuffer | null>(null);
  const [signingFields, setSigningFields] = useState<SigningField[]>([]);
  const [stampedPdfBytes, setStampedPdfBytes] = useState<Uint8Array | null>(null);

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

  const isPdfSigningNotification = useCallback((n: any) => {
    const t = String(n?.type || '');
    if (t.includes('Signing')) return true;
    if (t === 'AppMessageReceived') {
      const content = n?.data?.content;
      if (typeof content !== 'string') return false;
      try {
        const parsed = JSON.parse(content);
        return parsed?.type === 'pdf-signing-owner-ack' ||
          parsed?.type === 'pdf-signing-shared' ||
          parsed?.type === 'pdf-signing-signed-returned';
      } catch {
        return false;
      }
    }
    return false;
  }, []);

  useEffect(() => {
    if (!notifications || notifications.length === 0) return;
    const latest = notifications[0];
    if (!latest || latest.id === lastNotificationIdRef.current) return;
    lastNotificationIdRef.current = latest.id;
    if (isPdfSigningNotification(latest)) {
      loadData();
    }
  }, [notifications, isPdfSigningNotification, loadData]);

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) loadData();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [loadData]);

  // No periodic polling; rely on WS + visibility refresh

  // Step 1 of upload: validate inputs, read file, show field editor
  const handleUploadStep1 = async () => {
    if (!uploadFile || uploadConnectionIds.length === 0) {
      toast.error('Please select a PDF and at least one recipient');
      return;
    }

    if (!uploadFile.type.includes('pdf')) {
      toast.error('Please select a PDF file');
      return;
    }

    // Validate all selected connections have KEM keys ready
    for (const connId of uploadConnectionIds) {
      const kemStatus = kemStatuses[connId];
      if (!kemStatus?.ready) {
        const conn = connections.find(c => c.id === connId);
        toast.error(`Encryption keys not ready for ${conn?.theirLabel || connId}`);
        return;
      }
    }

    // Validate threshold
    const effectiveThreshold = uploadThreshold || uploadConnectionIds.length;
    if (effectiveThreshold < 1 || effectiveThreshold > uploadConnectionIds.length) {
      toast.error(`Required signatures must be between 1 and ${uploadConnectionIds.length}`);
      return;
    }

    // Read file into ArrayBuffer for the PDF viewer
    const data = await uploadFile.arrayBuffer();
    setFieldEditorPdfData(data);
    setShowUploadModal(false);
    setShowFieldEditor(true);
  };

  // Step 2 of upload: after field placement, upload the PDF with fields
  const handleUploadWithFields = async (fields: SigningField[]) => {
    if (!uploadFile || uploadConnectionIds.length === 0) return;

    setShowFieldEditor(false);
    setFieldEditorPdfData(null);
    setUploading(true);
    try {
      const effectiveThreshold = uploadThreshold || uploadConnectionIds.length;
      const response = await pdfSigningApi.upload(
        uploadFile,
        uploadConnectionIds,
        uploadDescription,
        fields,
        uploadConnectionIds.length > 1 ? effectiveThreshold : undefined
      );
      if (response.success) {
        const msg = uploadConnectionIds.length > 1
          ? `PDF uploaded and sent to ${uploadConnectionIds.length} recipients!`
          : 'PDF uploaded and encrypted successfully!';
        toast.success(msg);
        setUploadFile(null);
        setUploadConnectionIds([]);
        setUploadThreshold(0);
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

  // Initiate signing: download PDF, check for signing fields, then guided or direct
  const handleInitiateSign = async (vault: PdfVault) => {
    setSelectedVault(vault);
    setSigning(true);
    try {
      toast.info('Downloading document...');
      const pdfBlob = await pdfSigningApi.download(vault.vaultId);
      const pdfArrayBuffer = await pdfBlob.arrayBuffer();
      const fields = vault.signingFields || [];

      if (fields.length > 0) {
        // Has signing fields — show guided signing view
        setSigningPdfData(pdfArrayBuffer);
        setSigningFields(fields);
        setShowSigningView(true);
      } else {
        // No fields — go straight to sign modal (legacy flow)
        setShowSignModal(true);
      }
    } catch (error: any) {
      console.error('Failed to download PDF for signing:', error);
      toast.error(error.message || 'Failed to load document');
    } finally {
      setSigning(false);
    }
  };

  // Called when signer finishes guided view — stamped PDF ready, now show key/password modal
  const handleGuidedSignComplete = (stamped: Uint8Array) => {
    setStampedPdfBytes(stamped);
    setShowSigningView(false);
    setSigningPdfData(null);
    setSigningFields([]);
    setShowSignModal(true);
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

      let pdfBytes: Uint8Array;
      if (stampedPdfBytes) {
        // Guided flow: use pre-stamped PDF
        pdfBytes = stampedPdfBytes;
      } else {
        // Legacy flow: download fresh
        toast.info('Downloading document...');
        const pdfBlob = await pdfSigningApi.download(selectedVault.vaultId);
        pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
      }

      // Sign the PDF locally in the browser
      toast.info('Signing document locally...');
      const signedPdfBytes = await PdfSigner.signPdf(pdfBytes, signingKey, {
        reason: signReason || undefined,
        location: signLocation || undefined,
      });

      // Upload the signed PDF back to the server
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
        setStampedPdfBytes(null);
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
      loadData();
    } catch (error: any) {
      console.error('Failed to download PDF:', error);
      toast.error(error.message || 'Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  const handleReturn = async (vault: PdfVault) => {
    const ownerConnectionId = vault.ownerConnectionId || vault.signerConnectionId;
    if (!ownerConnectionId) {
      toast.error('Cannot determine owner connection ID');
      return;
    }

    setReturning(true);
    try {
      const response = await pdfSigningApi.returnSigned(vault.vaultId, ownerConnectionId);
      if (response.success) {
        toast.success('Signed PDF returned to owner!');
        loadData();
      }
    } catch (error: any) {
      console.error('Failed to return signed PDF:', error);
      toast.error(error.message || 'Failed to return signed PDF');
    } finally {
      setReturning(false);
    }
  };

  const handleVerify = async () => {
    if (!selectedVault) return;

    setVerifying(true);
    setVerificationResult(null);
    try {
      const response = await pdfSigningApi.verify(selectedVault.vaultId);
      if (response.success) {
        setVerificationResult(response);
        loadData();
      }
    } catch (error: any) {
      console.error('Failed to verify signature:', error);
      toast.error(error.message || 'Failed to verify signature');
      setShowVerifyModal(false);
    } finally {
      setVerifying(false);
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

  const [activeTab, setActiveTab] = useState<'action' | 'progress' | 'completed' | 'all'>('all');
  const [activeSection, setActiveSection] = useState<'pdf' | 'tasks'>('pdf');
  const actionSectionRef = useRef<HTMLDivElement | null>(null);
  const signedSectionRef = useRef<HTMLDivElement | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (Object.keys(openSections).length > 0) return;
    setOpenSections({
      toShare: pendingToShareVaults.length > 0,
      awaiting: awaitingSignatureVaults.length > 0,
      signedOwner: signedVaults.length > 0,
      toSign: toSignVaults.length > 0,
      toReturn: signedToReturnVaults.length > 0,
      completed: completedVaults.length > 0,
    });
  }, [
    openSections,
    pendingToShareVaults.length,
    awaitingSignatureVaults.length,
    signedVaults.length,
    toSignVaults.length,
    signedToReturnVaults.length,
    completedVaults.length,
  ]);

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const renderSectionHeader = (opts: {
    keyId: string;
    title: string;
    badge?: { label: string; className: string };
    count: number;
  }) => (
    <button
      type="button"
      onClick={() => toggleSection(opts.keyId)}
      className="w-full px-6 py-4 border-b border-border-primary flex items-center justify-between text-left"
    >
      <div className="flex items-center gap-2">
        {opts.badge && (
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${opts.badge.className}`}>
            {opts.badge.label}
          </span>
        )}
        <h2 className="text-lg font-semibold text-text-primary">{opts.title}</h2>
        <span className="text-xs text-text-tertiary bg-surface-100 dark:bg-surface-800 rounded-full px-2 py-0.5">
          {opts.count}
        </span>
      </div>
    
        
      <svg
        className={`h-4 w-4 text-text-tertiary transition-transform ${openSections[opts.keyId] ? 'rotate-180' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const actionRequiredCount = (status?.pendingToShare || 0) + (status?.toSign || 0) + (status?.signedToReturn || 0);
  const waitingCount = (status?.awaitingSignature || 0) + (status?.signed || 0);
  const newestToSign = [...toSignVaults]
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    })[0];

  return (
    <div className="space-y-8">
      {/* Top Tabs */}
      <div className="flex items-center justify-between w-full">
        {/* LEFT: Tabs */}
        <div className="inline-flex bg-surface-100 dark:bg-surface-800 rounded-xl p-1">
          {[
            { id: 'pdf', label: 'PDF' },
            { id: 'tasks', label: 'Tasks' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id as typeof activeSection)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                activeSection === tab.id
                  ? 'bg-white dark:bg-surface-700 text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* RIGHT: Buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowUploadModal(true)}
            className="btn btn-primary"
          >
            Upload PDF
          </button>

          <button
            onClick={() => {
              setActiveSection('tasks');
              setActiveTab('action');
              setOpenSections((prev) => ({ ...prev, toSign: true }));
              setTimeout(() => actionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
            }}
            className="btn btn-secondary"
          >
            Sign Documents
          </button>
        </div>
      </div>

      {/* PDF Section */}
      {activeSection === 'pdf' && (
        <div className="space-y-8">
          {/* <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
           
             
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowUploadModal(true)}
                className="btn btn-primary"
              >
                Get Signatures
              </button>
              <button
                onClick={() => {
                  setActiveSection('tasks');
                  setActiveTab('action');
                  setOpenSections((prev) => ({ ...prev, toSign: true }));
                  setTimeout(() => actionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                }}
                className="btn btn-secondary"
              >
                Sign a Document
              </button>
            </div>
          </div> */}

          <div className="space-y-4">
            <div className="card border border-border-secondary">
              <div className="px-6 py-5 space-y-3">
                <p className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">Get started</p>
                <h2 className="text-lg font-semibold text-text-primary">Send your first document for signature</h2>
                <p className="text-sm text-text-secondary">Upload a PDF, place fields, and send it to a signer in minutes.</p>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="btn btn-primary"
                >
                  Get Signatures
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="card border border-border-secondary">
                <div className="px-6 py-5 space-y-3">
                  <p className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">Need help getting started?</p>
                  <p className="text-sm text-text-secondary">Get help with basic questions and learn the signing flow.</p>
                  <button
                    type="button"
                    onClick={() => toast.info('Guide coming soon. Ask us for the link and we will add it.')}
                    className="btn btn-secondary"
                  >
                    View Our Guide
                  </button>
                </div>
              </div>
              <div className="card border border-border-secondary">
                <div className="px-6 py-5 space-y-3">
                  <p className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">All</p>
                  <p className="text-sm text-text-secondary">See every document and status in one place.</p>
                  <button
                      type="button"
                      onClick={() => {
                        setActiveSection('tasks');
                        setActiveTab('all');
                        setOpenSections({
                          toShare: true,
                          awaiting: true,
                          signedOwner: true,
                          toSign: true,
                          toReturn: true,
                          completed: true,
                        });
                        setTimeout(() => actionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                      }}
                      className="btn btn-secondary"
                    >
                      View All
                    </button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="card border border-border-secondary">
                <div className="px-6 py-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">Latest Task</p>
                    <button
                      type="button"
                      onClick={() => {
                  setActiveSection('tasks');
                  setActiveTab('action');
                  setOpenSections((prev) => ({ ...prev, toSign: true }));
                  setTimeout(() => actionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                }}
                      className="text-text-tertiary hover:text-text-primary"
                      aria-label="View all tasks"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                  {newestToSign ? (
                    <div className="border border-border-secondary rounded-lg p-4 flex items-start gap-3">
                      <svg className="h-6 w-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-text-tertiary">Needs to Sign</p>
                        <p className="text-sm font-medium text-text-primary truncate">{newestToSign.filename || 'Unnamed PDF'}</p>
                        <p className="text-xs text-text-tertiary truncate">
                          Received: {newestToSign.createdAt ? new Date(newestToSign.createdAt).toLocaleDateString() : 'Unknown'}
                        </p>
                      </div>
                      <button
                        onClick={() => handleInitiateSign(newestToSign)}
                        className="btn btn-sm btn-primary"
                      >
                        Sign
                      </button>
                    </div>
                  ) : (
                    <div className="border border-border-secondary rounded-lg p-4 text-sm text-text-tertiary">
                      No documents waiting for your signature.
                    </div>
                  )}
                </div>
              </div>
              <div className="card border border-border-secondary h-fit">
                <div className="px-6 py-5 space-y-4">
                  <p className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">Overview</p>
                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSection('tasks');
                        setActiveTab('action');
                        setOpenSections((prev) => ({ ...prev, toSign: true }));
                        setTimeout(() => actionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                      }}
                      className="text-text-secondary hover:text-text-primary"
                    >
                      Documents to Sign
                    </button>
                    <span className="font-semibold text-text-primary">{status?.toSign || 0}</span>
                  </div>
                  <div className="border-t border-border-secondary" />
                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSection('tasks');
                        setActiveTab('progress');
                        setOpenSections((prev) => ({ ...prev, signedOwner: true }));
                        setTimeout(() => signedSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                      }}
                      className="text-text-secondary hover:text-text-primary"
                    >
                      Signed Documents
                    </button>
                    <span className="font-semibold text-text-primary">{status?.signed || 0}</span>
                  </div>
                  <div className="border-t border-border-secondary" />
                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSection('tasks');
                        setActiveTab('completed');
                        setOpenSections((prev) => ({ ...prev, completed: true }));
                        setTimeout(() => actionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                      }}
                      className="text-text-secondary hover:text-text-primary"
                    >
                      Completed
                    </button>
                    <span className="font-semibold text-text-primary">{status?.completed || 0}</span>
                  </div>
                  {/* <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSection('tasks');
                        setActiveTab('all');
                        setOpenSections({
                          toShare: true,
                          awaiting: true,
                          signedOwner: true,
                          toSign: true,
                          toReturn: true,
                          completed: true,
                        });
                        setTimeout(() => actionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                      }}
                      className="btn btn-secondary w-full"
                    >
                      View All
                    </button>
                  </div> */}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tasks Section */}
      {activeSection === 'tasks' && (
        <div className="space-y-8">
          {/* Summary */}
          {status && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="card border border-border-secondary">
                <div className="px-5 py-4">
                  <p className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">Action required</p>
                  <p className="mt-2 text-2xl font-semibold text-text-primary">{actionRequiredCount}</p>
                </div>
              </div>
              <div className="card border border-border-secondary">
                <div className="px-5 py-4">
                  <p className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">Waiting</p>
                  <p className="mt-2 text-2xl font-semibold text-text-primary">{waitingCount}</p>
                </div>
              </div>
              <div className="card border border-border-secondary">
                <div className="px-5 py-4">
                  <p className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">Completed</p>
                  <p className="mt-2 text-2xl font-semibold text-text-primary">{status.completed}</p>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex items-center gap-2">
            <div className="inline-flex bg-surface-100 dark:bg-surface-800 rounded-xl p-1">
              {[
                { id: 'all', label: 'All' },
                { id: 'action', label: 'Action Required' },
                { id: 'progress', label: 'In Progress' },
                { id: 'completed', label: 'Completed' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? 'bg-white dark:bg-surface-700 text-text-primary shadow-sm'
                      : 'text-text-tertiary hover:text-text-primary'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-4">
        {/* Action Required */}
        {(activeTab === 'action' || activeTab === 'all') && (
          <>
            {(pendingToShareVaults.length > 0 || activeTab === 'all') && (
              <div className="card">
                {renderSectionHeader({
                  keyId: 'toShare',
                  title: 'Documents to Share',
                  badge: { label: 'Owner', className: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400' },
                  count: pendingToShareVaults.length,
                })}
                {openSections.toShare && (
                  pendingToShareVaults.length === 0 ? (
                    <div className="px-6 py-8 text-center text-text-secondary">No documents pending to share</div>
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
                            {canSignerDownload(vault) && (
                              <button
                                onClick={() => {
                                  setSelectedVault(vault);
                                  setShowDownloadModal(true);
                                }}
                                className="btn btn-sm btn-secondary"
                              >
                                Download
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}

            {(toSignVaults.length > 0 || activeTab === 'all') && (
              <div className="card">
                <div ref={actionSectionRef}>
                  {renderSectionHeader({
                    keyId: 'toSign',
                    title: 'Documents to Sign',
                    badge: { label: 'Signer', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
                    count: toSignVaults.length,
                  })}
                </div>
                {openSections.toSign && (
                  toSignVaults.length === 0 ? (
                    <div className="px-6 py-8 text-center text-text-secondary">No documents received for signing</div>
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
                              onClick={() => handleInitiateSign(vault)}
                              disabled={signing}
                              className="btn btn-sm btn-primary"
                            >
                              {signing && selectedVault?.vaultId === vault.vaultId ? 'Loading...' : 'Sign'}
                            </button>
                            {canSignerDownload(vault) && (
                              <button
                                onClick={() => {
                                  setSelectedVault(vault);
                                  setShowDownloadModal(true);
                                }}
                                className="btn btn-sm btn-secondary"
                              >
                                Download
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}

            {(signedToReturnVaults.length > 0 || activeTab === 'all') && (
              <div className="card">
                {renderSectionHeader({
                  keyId: 'toReturn',
                  title: 'Signed - Return to Owner',
                  badge: { label: 'Signer', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
                  count: signedToReturnVaults.length,
                })}
                {openSections.toReturn && (
                  signedToReturnVaults.length === 0 ? (
                    <div className="px-6 py-8 text-center text-text-secondary">No signed documents to return</div>
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
                            {!vault.returnedAt && (
                              <button
                                onClick={() => handleReturn(vault)}
                                disabled={returning}
                                className="btn btn-sm btn-primary"
                              >
                                {returning ? 'Returning...' : 'Return to Owner'}
                              </button>
                            )}
                            {canSignerDownload(vault) && (
                              <button
                                onClick={() => {
                                  setSelectedVault(vault);
                                  setShowDownloadModal(true);
                                }}
                                className="btn btn-sm btn-secondary"
                              >
                                Download
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}
          </>
        )}

        {/* In Progress */}
        {(activeTab === 'progress' || activeTab === 'all') && (
          <>
            {(awaitingSignatureVaults.length > 0 || activeTab === 'all') && (
              <div className="card">
                {renderSectionHeader({
                  keyId: 'awaiting',
                  title: 'Awaiting Signature',
                  badge: { label: 'Owner', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
                  count: awaitingSignatureVaults.length,
                })}
                {openSections.awaiting && (
                  awaitingSignatureVaults.length === 0 ? (
                    <div className="px-6 py-8 text-center text-text-secondary">No documents awaiting signature from others</div>
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
                              {/* Multi-recipient signing progress */}
                              {vault.signingProgress && vault.signingProgress.total > 1 && (
                                <div className="mt-1">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full max-w-[120px]">
                                      <div
                                        className="h-1.5 bg-blue-500 rounded-full transition-all"
                                        style={{ width: `${Math.min(100, (vault.signingProgress.signed / vault.signingProgress.required) * 100)}%` }}
                                      />
                                    </div>
                                    <span className="text-xs text-text-secondary">
                                      {vault.signingProgress.signed}/{vault.signingProgress.required} signed
                                      {vault.signingProgress.total !== vault.signingProgress.required &&
                                        ` (${vault.signingProgress.total} total)`}
                                    </span>
                                  </div>
                                  {vault.signingProgress.signers && (
                                    <div className="flex gap-1 mt-1">
                                      {vault.signingProgress.signers.map((s, idx) => (
                                        <span
                                          key={idx}
                                          className={`inline-block w-2 h-2 rounded-full ${
                                            s.isSigned ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                                          }`}
                                          title={`Signer ${idx + 1}: ${s.isSigned ? 'Signed' : 'Pending'}`}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
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
                  )
                )}
              </div>
            )}

            {(signedVaults.length > 0 || activeTab === 'all') && (
              <div className="card">
                <div ref={signedSectionRef}>
                  {renderSectionHeader({
                    keyId: 'signedOwner',
                    title: 'Signed Documents',
                    badge: { label: 'Owner', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
                    count: signedVaults.length,
                  })}
                </div>
                {openSections.signedOwner && (
                  signedVaults.length === 0 ? (
                    <div className="px-6 py-8 text-center text-text-secondary">No signed documents yet</div>
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
                              {vault.signingProgress && vault.signingProgress.total > 1 && (
                                <div className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                                  {vault.signingProgress.signed}/{vault.signingProgress.required} signatures collected
                                  {vault.signingProgress.signed >= vault.signingProgress.required && ' — Threshold met'}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <span className="px-2 py-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded">
                              Signature Confirmed
                            </span>
                            <button
                              onClick={() => {
                                setSelectedVault(vault);
                                setVerificationResult(null);
                                setShowVerifyModal(true);
                              }}
                              className="btn btn-sm btn-secondary"
                            >
                              Verify
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
                  )
                )}
              </div>
            )}
          </>
        )}

        {/* Completed */}
        {(activeTab === 'completed' || activeTab === 'all') && (
          <>
            {(completedVaults.length > 0 || activeTab === 'all') && (
              <div className="card">
                {renderSectionHeader({
                  keyId: 'completed',
                  title: 'Completed',
                  count: completedVaults.length,
                })}
                {openSections.completed && (
                  completedVaults.length === 0 ? (
                    <div className="px-6 py-8 text-center text-text-secondary">No completed signing workflows</div>
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
                                Completed: {(vault.returnedAt || vault.ownerAckAt) ? new Date(vault.returnedAt || vault.ownerAckAt!).toLocaleDateString() : 'Unknown'}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {canSignerDownload(vault) && (
                              <button
                                onClick={() => {
                                  setSelectedVault(vault);
                                  setShowDownloadModal(true);
                                }}
                                className="btn btn-sm btn-secondary"
                              >
                                Download
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}
          </>
        )}

        {activeTab !== 'all' &&
          ((activeTab === 'action' &&
            pendingToShareVaults.length === 0 &&
            toSignVaults.length === 0 &&
            signedToReturnVaults.length === 0) ||
            (activeTab === 'progress' &&
              awaitingSignatureVaults.length === 0 &&
              signedVaults.length === 0) ||
            (activeTab === 'completed' && completedVaults.length === 0)) && (
            <div className="card">
              <div className="px-6 py-8 text-center text-text-secondary">
                Nothing here right now.
              </div>
            </div>
          )}
      </div>
        </div>
      )}

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
                <label className="form-label">Send to (encrypted) — select one or more</label>
                <div className="border border-border-primary rounded-md max-h-48 overflow-y-auto">
                  {connections.length === 0 && (
                    <p className="px-3 py-4 text-sm text-warning-600">
                      No active connections found. Create a connection first.
                    </p>
                  )}
                  {connections.map((conn) => {
                    const kemStatus = kemStatuses[conn.id];
                    const isReady = kemStatus?.ready;
                    const isSelected = uploadConnectionIds.includes(conn.id);
                    return (
                      <label
                        key={conn.id}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-bg-secondary transition-colors ${
                          !isReady ? 'opacity-50 cursor-not-allowed' : ''
                        } ${isSelected ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!isReady}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setUploadConnectionIds(prev => [...prev, conn.id]);
                            } else {
                              setUploadConnectionIds(prev => prev.filter(id => id !== conn.id));
                            }
                          }}
                          className="rounded border-border-primary"
                        />
                        <span className="text-sm">
                          {isReady ? '🔒 ' : '⚠️ '}
                          {conn.theirLabel || conn.id}
                          {!isReady && ' (keys not exchanged)'}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {connections.length > 0 && !connections.some(c => kemStatuses[c.id]?.ready) && (
                  <p className="mt-2 text-sm text-warning-600">
                    No connections have encryption keys ready. Go to Connections page to exchange keys first.
                  </p>
                )}
                {uploadConnectionIds.length > 0 && (
                  <p className="mt-1 text-xs text-text-secondary">
                    {uploadConnectionIds.length} recipient{uploadConnectionIds.length > 1 ? 's' : ''} selected
                  </p>
                )}
              </div>

              {/* Threshold input — only show when multiple recipients selected */}
              {uploadConnectionIds.length > 1 && (
                <div>
                  <label className="form-label">Required signatures</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={uploadConnectionIds.length}
                      value={uploadThreshold || uploadConnectionIds.length}
                      onChange={(e) => setUploadThreshold(parseInt(e.target.value, 10) || 0)}
                      className="input w-20 text-center"
                    />
                    <span className="text-sm text-text-secondary">
                      of {uploadConnectionIds.length} signers must sign
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">
                    {(uploadThreshold || uploadConnectionIds.length) === uploadConnectionIds.length
                      ? 'All signers must sign (default)'
                      : `Any ${uploadThreshold} of ${uploadConnectionIds.length} signers can complete the signing`}
                  </p>
                </div>
              )}

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
                  <span>
                    {uploadConnectionIds.length > 1
                      ? `Document will be encrypted separately to each recipient using post-quantum ML-KEM-768 encryption.`
                      : `Document will be encrypted using post-quantum ML-KEM-768 encryption to the recipient's key.`}
                  </span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border-primary flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadFile(null);
                  setUploadConnectionIds([]);
                  setUploadThreshold(0);
                  setUploadDescription('');
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleUploadStep1}
                disabled={!uploadFile || uploadConnectionIds.length === 0 || !uploadConnectionIds.every(id => kemStatuses[id]?.ready) || uploading}
                className="btn btn-primary"
              >
                {uploading ? 'Uploading...' : 'Next: Place Fields'}
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

      {/* Field Placement Editor (Owner upload step 2) */}
      {showFieldEditor && fieldEditorPdfData && (
        <FieldPlacementEditor
          pdfData={fieldEditorPdfData}
          onComplete={handleUploadWithFields}
          onCancel={() => {
            setShowFieldEditor(false);
            setFieldEditorPdfData(null);
            setShowUploadModal(true); // Go back to step 1
          }}
        />
      )}

      {/* Guided Signing View (Signer flow) */}
      {showSigningView && signingPdfData && (
        <SigningGuidedView
          pdfData={signingPdfData}
          fields={signingFields}
          signerName=""
          onComplete={handleGuidedSignComplete}
          onCancel={() => {
            setShowSigningView(false);
            setSigningPdfData(null);
            setSigningFields([]);
            setSelectedVault(null);
          }}
        />
      )}

      {/* Verify Signature Modal */}
      {showVerifyModal && selectedVault && (
        <div className="modal-backdrop">
          <div className="modal-container max-w-md">
            <div className="px-6 py-4 border-b border-border-primary">
              <h3 className="text-lg font-semibold text-text-primary">Verify Signature</h3>
              <p className="text-sm text-text-tertiary">{selectedVault.filename || 'Unnamed PDF'}</p>
            </div>

            <div className="px-6 py-4 space-y-4">
              {verifying && (
                <div className="flex flex-col items-center py-6">
                  <svg className="animate-spin h-8 w-8 text-primary-500 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  <p className="text-text-secondary">Verifying signature...</p>
                </div>
              )}

              {!verifying && verificationResult && !verificationResult.hasSignature && (
                <div className="text-center py-6">
                  <svg className="mx-auto h-12 w-12 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <p className="mt-3 text-text-secondary font-medium">No Signature Found</p>
                  <p className="text-sm text-text-tertiary mt-1">This PDF does not contain a digital signature.</p>
                </div>
              )}

              {!verifying && verificationResult && verificationResult.hasSignature && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    {verificationResult.valid ? (
                      <span className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Valid Signature
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Invalid Signature
                      </span>
                    )}
                  </div>

                  <div className="bg-surface-50 dark:bg-surface-800 rounded-lg p-4 space-y-2">
                    {verificationResult.signerName && (
                      <div className="flex justify-between text-sm">
                        <span className="text-text-tertiary">Signer</span>
                        <span className="text-text-primary font-medium">{verificationResult.signerName}</span>
                      </div>
                    )}
                    {verificationResult.reason && (
                      <div className="flex justify-between text-sm">
                        <span className="text-text-tertiary">Reason</span>
                        <span className="text-text-primary">{verificationResult.reason}</span>
                      </div>
                    )}
                    {verificationResult.location && (
                      <div className="flex justify-between text-sm">
                        <span className="text-text-tertiary">Location</span>
                        <span className="text-text-primary">{verificationResult.location}</span>
                      </div>
                    )}
                    {verificationResult.signingTime && (
                      <div className="flex justify-between text-sm">
                        <span className="text-text-tertiary">Signed At</span>
                        <span className="text-text-primary">
                          {(() => {
                            const parsed = parsePdfDateString(verificationResult.signingTime);
                            return parsed ? parsed.toLocaleString() : 'Unknown';
                          })()}
                        </span>
                      </div>
                    )}
                    {verificationResult.error && (
                      <div className="flex justify-between text-sm">
                        <span className="text-text-tertiary">Error</span>
                        <span className="text-red-600 dark:text-red-400">{verificationResult.error}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!verifying && !verificationResult && (
                <div className="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-md text-sm text-primary-700 dark:text-primary-300">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    <span>The document will be decrypted and its digital signature verified.</span>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border-primary flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowVerifyModal(false);
                  setSelectedVault(null);
                  setVerificationResult(null);
                }}
                className="btn btn-secondary"
              >
                Close
              </button>
              {!verificationResult && (
                <button
                  onClick={handleVerify}
                  disabled={verifying}
                  className="btn btn-primary"
                >
                  {verifying ? 'Verifying...' : 'Verify Signature'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
