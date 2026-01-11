'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { KeyManager, StoredSigningKey, AlgorithmType } from '../../../lib/signing';

interface GenerateKeyForm {
  name: string;
  algorithm: AlgorithmType;
  commonName: string;
  organization: string;
  email: string;
  validityYears: number;
  password: string;
  confirmPassword: string;
}

export default function SigningKeysPage() {
  const [keys, setKeys] = useState<StoredSigningKey[]>([]);
  const [loading, setLoading] = useState(true);

  // Generate key modal
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateForm, setGenerateForm] = useState<GenerateKeyForm>({
    name: '',
    algorithm: 'RSA-2048',
    commonName: '',
    organization: '',
    email: '',
    validityYears: 1,
    password: '',
    confirmPassword: '',
  });
  const [generating, setGenerating] = useState(false);

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState('');
  const [importStorePassword, setImportStorePassword] = useState('');
  const [importConfirmPassword, setImportConfirmPassword] = useState('');
  const [importName, setImportName] = useState('');
  const [importing, setImporting] = useState(false);

  // Export modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedKey, setSelectedKey] = useState<StoredSigningKey | null>(null);
  const [exportPassword, setExportPassword] = useState('');
  const [exportFilePassword, setExportFilePassword] = useState('');
  const [exporting, setExporting] = useState(false);

  // Delete confirmation
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<StoredSigningKey | null>(null);

  // Certificate details modal
  const [showCertModal, setShowCertModal] = useState(false);
  const [certDetails, setCertDetails] = useState<{
    commonName?: string;
    organization?: string;
    email?: string;
    validFrom: Date;
    validTo: Date;
    issuer: string;
    subject: string;
  } | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      const storedKeys = await KeyManager.listKeys();
      setKeys(storedKeys);
    } catch (error) {
      console.error('Failed to load keys:', error);
      toast.error('Failed to load signing keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleGenerateKey = async () => {
    if (!generateForm.name || !generateForm.commonName || !generateForm.password) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (generateForm.password !== generateForm.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (generateForm.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setGenerating(true);
    try {
      await KeyManager.generateKey(
        generateForm.name,
        generateForm.algorithm,
        {
          commonName: generateForm.commonName,
          organization: generateForm.organization || undefined,
          email: generateForm.email || undefined,
          validityYears: generateForm.validityYears,
        },
        generateForm.password
      );

      toast.success('Signing key generated successfully!');
      setShowGenerateModal(false);
      resetGenerateForm();
      loadKeys();
    } catch (error: any) {
      console.error('Failed to generate key:', error);
      toast.error(error.message || 'Failed to generate signing key');
    } finally {
      setGenerating(false);
    }
  };

  const handleImportKey = async () => {
    if (!importFile || !importPassword || !importStorePassword) {
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

    setImporting(true);
    try {
      await KeyManager.importP12(
        importFile,
        importPassword,
        importStorePassword,
        importName || undefined
      );

      toast.success('Signing key imported successfully!');
      setShowImportModal(false);
      resetImportForm();
      loadKeys();
    } catch (error: any) {
      console.error('Failed to import key:', error);
      toast.error(error.message || 'Failed to import signing key. Check the file and password.');
    } finally {
      setImporting(false);
    }
  };

  const handleExportKey = async () => {
    if (!selectedKey || !exportPassword || !exportFilePassword) {
      toast.error('Please provide passwords');
      return;
    }

    setExporting(true);
    try {
      const blob = await KeyManager.exportP12(selectedKey.id, exportPassword, exportFilePassword);

      // Download the file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedKey.name.replace(/\s+/g, '_')}.p12`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Key exported successfully!');
      setShowExportModal(false);
      resetExportForm();
    } catch (error: any) {
      console.error('Failed to export key:', error);
      toast.error(error.message || 'Failed to export key. Check your password.');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!keyToDelete) return;

    try {
      await KeyManager.deleteKey(keyToDelete.id);
      toast.success('Key deleted');
      setShowDeleteModal(false);
      setKeyToDelete(null);
      loadKeys();
    } catch (error: any) {
      console.error('Failed to delete key:', error);
      toast.error(error.message || 'Failed to delete key');
    }
  };

  const viewCertificateDetails = (key: StoredSigningKey) => {
    try {
      const details = KeyManager.parseCertificateDetails(key.certificatePem);
      setCertDetails(details);
      setSelectedKey(key);
      setShowCertModal(true);
    } catch (error) {
      console.error('Failed to parse certificate:', error);
      toast.error('Failed to read certificate details');
    }
  };

  const resetGenerateForm = () => {
    setGenerateForm({
      name: '',
      algorithm: 'RSA-2048',
      commonName: '',
      organization: '',
      email: '',
      validityYears: 1,
      password: '',
      confirmPassword: '',
    });
  };

  const resetImportForm = () => {
    setImportFile(null);
    setImportPassword('');
    setImportStorePassword('');
    setImportConfirmPassword('');
    setImportName('');
  };

  const resetExportForm = () => {
    setSelectedKey(null);
    setExportPassword('');
    setExportFilePassword('');
  };

  const isKeyExpired = (expiresAt: Date) => {
    return new Date(expiresAt) < new Date();
  };

  const isKeyExpiringSoon = (expiresAt: Date) => {
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    return new Date(expiresAt).getTime() - Date.now() < thirtyDays;
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
          <h1 className="text-2xl font-bold text-text-primary">Signing Keys</h1>
          <p className="text-text-secondary">Manage your PDF signing keys locally in your browser</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="btn btn-secondary"
          >
            Import Key
          </button>
          <button
            onClick={() => setShowGenerateModal(true)}
            className="btn btn-primary"
          >
            + Generate Key
          </button>
        </div>
      </div>

      {/* Security Notice */}
      <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-6 h-6 text-primary-600 dark:text-primary-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <div>
            <h3 className="font-semibold text-primary-800 dark:text-primary-300">Your Keys Stay Local</h3>
            <p className="text-sm text-primary-700 dark:text-primary-400 mt-1">
              Private keys are encrypted and stored only in your browser's IndexedDB. They are never sent to any server.
              PDF signing happens entirely in your browser using WebCrypto.
            </p>
          </div>
        </div>
      </div>

      {/* Keys List */}
      <div className="card">
        <div className="px-6 py-4 border-b border-border-primary">
          <h2 className="text-lg font-semibold text-text-primary">Your Signing Keys</h2>
        </div>

        {keys.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <svg className="mx-auto h-12 w-12 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-text-primary">No signing keys</h3>
            <p className="mt-2 text-text-secondary">Generate a new key or import an existing one to start signing PDFs.</p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={() => setShowImportModal(true)}
                className="btn btn-secondary"
              >
                Import .p12 File
              </button>
              <button
                onClick={() => setShowGenerateModal(true)}
                className="btn btn-primary"
              >
                Generate New Key
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border-secondary">
            {keys.map((key) => (
              <div key={key.id} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                      <svg className="w-8 h-8 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-text-primary">{key.name}</h3>
                        <span className="px-2 py-0.5 text-xs font-medium bg-surface-100 dark:bg-surface-800 text-text-secondary rounded">
                          {key.algorithm}
                        </span>
                        {isKeyExpired(key.expiresAt) && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400 rounded">
                            Expired
                          </span>
                        )}
                        {!isKeyExpired(key.expiresAt) && isKeyExpiringSoon(key.expiresAt) && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400 rounded">
                            Expiring Soon
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => viewCertificateDetails(key)}
                        className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 mt-1"
                      >
                        View Certificate Details
                      </button>
                      <div className="text-xs text-text-tertiary mt-2 space-y-1">
                        <div>Created: {new Date(key.createdAt).toLocaleDateString()}</div>
                        <div>Expires: {new Date(key.expiresAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSelectedKey(key);
                        setShowExportModal(true);
                      }}
                      className="btn btn-sm btn-secondary"
                    >
                      Export .p12
                    </button>
                    <button
                      onClick={() => {
                        setKeyToDelete(key);
                        setShowDeleteModal(true);
                      }}
                      className="btn btn-sm bg-error-600 hover:bg-error-700 text-white"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generate Key Modal */}
      {showGenerateModal && (
        <div className="modal-backdrop">
          <div className="modal-container max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-border-primary">
              <h3 className="text-lg font-semibold text-text-primary">Generate Signing Key</h3>
              <p className="text-sm text-text-tertiary">Create a new self-signed certificate for PDF signing</p>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="form-label">Key Name *</label>
                <input
                  type="text"
                  value={generateForm.name}
                  onChange={(e) => setGenerateForm({ ...generateForm, name: e.target.value })}
                  placeholder="My Signing Key"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="form-label">Algorithm</label>
                <select
                  value={generateForm.algorithm}
                  onChange={(e) => setGenerateForm({ ...generateForm, algorithm: e.target.value as AlgorithmType })}
                  className="input w-full"
                >
                  <option value="RSA-2048">RSA-2048 (Recommended)</option>
                  <option value="RSA-4096">RSA-4096 (Stronger, Slower)</option>
                  <option value="ECDSA-P256">ECDSA P-256 (Fast, Modern)</option>
                </select>
              </div>

              <div className="border-t border-border-secondary pt-4">
                <h4 className="font-medium text-text-primary mb-3">Certificate Details</h4>

                <div className="space-y-3">
                  <div>
                    <label className="form-label">Common Name (Your Name) *</label>
                    <input
                      type="text"
                      value={generateForm.commonName}
                      onChange={(e) => setGenerateForm({ ...generateForm, commonName: e.target.value })}
                      placeholder="John Doe"
                      className="input w-full"
                    />
                  </div>

                  <div>
                    <label className="form-label">Organization</label>
                    <input
                      type="text"
                      value={generateForm.organization}
                      onChange={(e) => setGenerateForm({ ...generateForm, organization: e.target.value })}
                      placeholder="Acme Corporation"
                      className="input w-full"
                    />
                  </div>

                  <div>
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      value={generateForm.email}
                      onChange={(e) => setGenerateForm({ ...generateForm, email: e.target.value })}
                      placeholder="john@example.com"
                      className="input w-full"
                    />
                  </div>

                  <div>
                    <label className="form-label">Valid For</label>
                    <select
                      value={generateForm.validityYears}
                      onChange={(e) => setGenerateForm({ ...generateForm, validityYears: parseInt(e.target.value) })}
                      className="input w-full"
                    >
                      <option value={1}>1 Year</option>
                      <option value={2}>2 Years</option>
                      <option value={3}>3 Years</option>
                      <option value={5}>5 Years</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-border-secondary pt-4">
                <h4 className="font-medium text-text-primary mb-3">Protection Password</h4>
                <p className="text-xs text-text-tertiary mb-3">
                  This password encrypts your private key in the browser storage.
                  You'll need it to sign documents or export the key.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="form-label">Password *</label>
                    <input
                      type="password"
                      value={generateForm.password}
                      onChange={(e) => setGenerateForm({ ...generateForm, password: e.target.value })}
                      placeholder="At least 8 characters"
                      className="input w-full"
                    />
                  </div>

                  <div>
                    <label className="form-label">Confirm Password *</label>
                    <input
                      type="password"
                      value={generateForm.confirmPassword}
                      onChange={(e) => setGenerateForm({ ...generateForm, confirmPassword: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border-primary flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowGenerateModal(false);
                  resetGenerateForm();
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateKey}
                disabled={generating || !generateForm.name || !generateForm.commonName || !generateForm.password || generateForm.password !== generateForm.confirmPassword}
                className="btn btn-primary"
              >
                {generating ? 'Generating...' : 'Generate Key'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Key Modal */}
      {showImportModal && (
        <div className="modal-backdrop">
          <div className="modal-container max-w-lg">
            <div className="px-6 py-4 border-b border-border-primary">
              <h3 className="text-lg font-semibold text-text-primary">Import Signing Key</h3>
              <p className="text-sm text-text-tertiary">Import a PKCS#12 (.p12/.pfx) file containing your certificate and private key</p>
            </div>

            <div className="px-6 py-4 space-y-4">
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
                  value={importPassword}
                  onChange={(e) => setImportPassword(e.target.value)}
                  placeholder="Password used to encrypt the .p12 file"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="form-label">Key Name (optional)</label>
                <input
                  type="text"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  placeholder="Leave empty to auto-generate"
                  className="input w-full"
                />
              </div>

              <div className="border-t border-border-secondary pt-4">
                <h4 className="font-medium text-text-primary mb-3">Storage Password</h4>
                <p className="text-xs text-text-tertiary mb-3">
                  Set a password to protect the key in your browser storage.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="form-label">Storage Password *</label>
                    <input
                      type="password"
                      value={importStorePassword}
                      onChange={(e) => setImportStorePassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="input w-full"
                    />
                  </div>

                  <div>
                    <label className="form-label">Confirm Password *</label>
                    <input
                      type="password"
                      value={importConfirmPassword}
                      onChange={(e) => setImportConfirmPassword(e.target.value)}
                      className="input w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border-primary flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  resetImportForm();
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleImportKey}
                disabled={importing || !importFile || !importPassword || !importStorePassword || importStorePassword !== importConfirmPassword}
                className="btn btn-primary"
              >
                {importing ? 'Importing...' : 'Import Key'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Key Modal */}
      {showExportModal && selectedKey && (
        <div className="modal-backdrop">
          <div className="modal-container max-w-md">
            <div className="px-6 py-4 border-b border-border-primary">
              <h3 className="text-lg font-semibold text-text-primary">Export Signing Key</h3>
              <p className="text-sm text-text-tertiary">{selectedKey.name}</p>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="p-3 bg-warning-50 dark:bg-warning-900/20 rounded-md text-sm text-warning-700 dark:text-warning-300">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>Keep the exported file secure! Anyone with this file and its password can sign documents as you.</span>
                </div>
              </div>

              <div>
                <label className="form-label">Your Key Password *</label>
                <input
                  type="password"
                  value={exportPassword}
                  onChange={(e) => setExportPassword(e.target.value)}
                  placeholder="Password used when creating/importing the key"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="form-label">Export File Password *</label>
                <input
                  type="password"
                  value={exportFilePassword}
                  onChange={(e) => setExportFilePassword(e.target.value)}
                  placeholder="Password to protect the exported .p12 file"
                  className="input w-full"
                />
                <p className="text-xs text-text-tertiary mt-1">
                  This will be required when importing the file elsewhere
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border-primary flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowExportModal(false);
                  resetExportForm();
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleExportKey}
                disabled={exporting || !exportPassword || !exportFilePassword}
                className="btn btn-primary"
              >
                {exporting ? 'Exporting...' : 'Export .p12'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && keyToDelete && (
        <div className="modal-backdrop">
          <div className="modal-container max-w-md">
            <div className="px-6 py-4 border-b border-border-primary">
              <h3 className="text-lg font-semibold text-text-primary">Delete Signing Key</h3>
            </div>

            <div className="px-6 py-4">
              <p className="text-text-secondary">
                Are you sure you want to delete <strong>"{keyToDelete.name}"</strong>?
              </p>
              <p className="text-sm text-error-600 mt-2">
                This action cannot be undone. Make sure you have exported a backup if needed.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-border-primary flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setKeyToDelete(null);
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteKey}
                className="btn bg-error-600 hover:bg-error-700 text-white"
              >
                Delete Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Certificate Details Modal */}
      {showCertModal && certDetails && selectedKey && (
        <div className="modal-backdrop">
          <div className="modal-container max-w-lg">
            <div className="px-6 py-4 border-b border-border-primary">
              <h3 className="text-lg font-semibold text-text-primary">Certificate Details</h3>
              <p className="text-sm text-text-tertiary">{selectedKey.name}</p>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-tertiary">Common Name</label>
                  <div className="text-text-primary">{certDetails.commonName || '-'}</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-tertiary">Organization</label>
                  <div className="text-text-primary">{certDetails.organization || '-'}</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-tertiary">Email</label>
                  <div className="text-text-primary">{certDetails.email || '-'}</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-tertiary">Algorithm</label>
                  <div className="text-text-primary">{selectedKey.algorithm}</div>
                </div>
              </div>

              <div className="border-t border-border-secondary pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-text-tertiary">Valid From</label>
                    <div className="text-text-primary">{certDetails.validFrom.toLocaleDateString()}</div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-tertiary">Valid To</label>
                    <div className="text-text-primary">{certDetails.validTo.toLocaleDateString()}</div>
                  </div>
                </div>
              </div>

              <div className="border-t border-border-secondary pt-4">
                <div>
                  <label className="block text-xs font-medium text-text-tertiary mb-1">Subject</label>
                  <div className="text-sm text-text-primary font-mono bg-surface-100 dark:bg-surface-800 p-2 rounded">
                    {certDetails.subject}
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-text-tertiary mb-1">Issuer</label>
                  <div className="text-sm text-text-primary font-mono bg-surface-100 dark:bg-surface-800 p-2 rounded">
                    {certDetails.issuer}
                  </div>
                </div>
              </div>

              {certDetails.issuer === certDetails.subject && (
                <div className="p-3 bg-warning-50 dark:bg-warning-900/20 rounded-md text-sm text-warning-700 dark:text-warning-300">
                  This is a self-signed certificate. PDF readers will show this signature as "not verified" but the signature itself is cryptographically valid.
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border-primary flex justify-end">
              <button
                onClick={() => {
                  setShowCertModal(false);
                  setCertDetails(null);
                  setSelectedKey(null);
                }}
                className="btn btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
