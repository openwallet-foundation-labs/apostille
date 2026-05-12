'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  credentialDefinitionApi,
  oid4vciApi,
  schemaApi,
  type CredentialFormat,
  type MdocCredentialData,
  type MdocNamespaceData,
} from '../../../lib/api';
import { QRCodeSVG } from 'qrcode.react';
import MdlIssuanceForm from '../../components/mdoc/MdlIssuanceForm';
import AnonCredsIssuanceForm from '../../components/oid4vci/AnonCredsIssuanceForm';
import WirePayloadInspector from '../../components/oid4vci/WirePayloadInspector';
import Link from 'next/link';

interface CredentialDefinition {
  id: string;
  credentialDefinitionId: string;
  schemaId: string;
  tag: string;
  format?: CredentialFormat;
  schemaAttributes?: string[];
  doctype?: string;
  namespaces?: MdocNamespaceData;
  overlay?: {
    meta?: {
      name?: string;
      description?: string;
      issuer?: string;
    };
    branding?: {
      primary_background_color?: string;
      logo?: string;
    };
  };
}

interface CredentialOffer {
  offerId: string;
  offerUri: string;
  txCode?: string;
  expiresAt: string;
  status: 'pending' | 'token_issued' | 'credential_request_received' | 'credential_issued' | 'expired';
  format?: CredentialFormat;
}

interface SchemaSummary {
  schemaId: string
  name: string
  version: string
}

export default function OID4VCIPage() {
  const { tenantId } = useAuth();
  const [credDefs, setCredDefs] = useState<CredentialDefinition[]>([]);
  // Map of schemaId → { name, version } so the dropdown can render the
  // schema's friendly name beside each cred-def (cred-def itself only
  // carries the opaque schemaId).
  const [schemasById, setSchemasById] = useState<Record<string, SchemaSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [selectedCredDefId, setSelectedCredDefId] = useState('');
  const [credentialData, setCredentialData] = useState<Record<string, string>>({});
  const [mdocCredentialData, setMdocCredentialData] = useState<MdocCredentialData>({});
  const [txCodeRequired, setTxCodeRequired] = useState(false);
  const [creating, setCreating] = useState(false);

  // Offer state
  const [currentOffer, setCurrentOffer] = useState<CredentialOffer | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Fetch OID4VC credential definitions
  useEffect(() => {
    const fetchCredDefs = async () => {
      if (!tenantId) return;

      setLoading(true);
      try {
        const [credDefResp, schemasResp] = await Promise.all([
          credentialDefinitionApi.getAll(),
          schemaApi.getAll().catch(() => ({ schemas: [] })),
        ]);
        const allCredDefs = credDefResp.credentialDefinitions || [];

        // Filter to show formats that support QR-based OID4VCI issuance.
        // Covers: oid4vc (SD-JWT VC), mso_mdoc, anoncreds, and the new
        // W3C VC / OpenBadges v3 formats.
        const qrIssuableCredDefs = allCredDefs.filter(
          (cd: CredentialDefinition) =>
            cd.format === 'oid4vc' ||
            cd.format === 'mso_mdoc' ||
            cd.format === 'anoncreds' ||
            cd.format === 'jwt_vc_json' ||
            cd.format === 'jwt_vc_json-ld' ||
            cd.format === 'ldp_vc' ||
            cd.format === 'openbadge_v3'
        );

        // Build a lookup keyed by both Askar record id and the on-ledger
        // schemaId — cred-defs reference either depending on storage path.
        const lookup: Record<string, SchemaSummary> = {};
        for (const s of schemasResp.schemas || []) {
          const summary: SchemaSummary = {
            schemaId: s.schemaId || s.id,
            name: s.schema?.name || s._tags?.schemaName || '',
            version: s.schema?.version || s._tags?.schemaVersion || '',
          };
          if (s.id) lookup[s.id] = summary;
          if (s.schemaId) lookup[s.schemaId] = summary;
        }

        setCredDefs(qrIssuableCredDefs);
        setSchemasById(lookup);
        setError(null);
      } catch (err: any) {
        console.error('Error fetching credential definitions:', err);
        setError(err.message || 'Failed to fetch credential definitions');
      } finally {
        setLoading(false);
      }
    };

    fetchCredDefs();
  }, [tenantId]);

  // Get selected credential definition
  const selectedCredDef = credDefs.find(cd => cd.credentialDefinitionId === selectedCredDefId);

  // Initialize credential data fields when credential definition changes
  useEffect(() => {
    if (selectedCredDef?.schemaAttributes) {
      const initialData: Record<string, string> = {};
      selectedCredDef.schemaAttributes.forEach(attr => {
        initialData[attr] = '';
      });
      setCredentialData(initialData);
    }
  }, [selectedCredDef]);

  // Poll for offer status
  const pollOfferStatus = useCallback(async (offerId: string) => {
    try {
      const response = await oid4vciApi.getOfferStatus(offerId);
      if (response.success) {
        setCurrentOffer(prev => prev ? {
          ...prev,
          status: response.status,
        } : null);

        // Stop polling if credential is issued or expired
        if (response.status === 'credential_issued' || response.status === 'expired') {
          if (pollingInterval) {
            clearInterval(pollingInterval);
            setPollingInterval(null);
          }
        }
      }
    } catch (err) {
      console.error('Error polling offer status:', err);
    }
  }, [pollingInterval]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // Create credential offer
  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCredDef) return;

    setCreating(true);
    setError(null);

    try {
      // Use mdoc data for mso_mdoc format, otherwise use regular credential data
      const dataToSend = selectedCredDef.format === 'mso_mdoc'
        ? mdocCredentialData
        : credentialData;

      const response = await oid4vciApi.createOffer({
        credentialDefinitionId: selectedCredDef.credentialDefinitionId,
        credentialConfigurationId: selectedCredDef.tag,
        credentialData: dataToSend,
        txCodeRequired,
      });

      if (response.success) {
        setCurrentOffer({
          offerId: response.offerId,
          offerUri: response.offerUri,
          txCode: response.txCode,
          expiresAt: response.expiresAt,
          status: 'pending',
          format: response.format ?? selectedCredDef.format,
        });

        // Start polling for status updates
        const interval = setInterval(() => {
          pollOfferStatus(response.offerId);
        }, 2000);
        setPollingInterval(interval);
      }
    } catch (err: any) {
      console.error('Error creating offer:', err);
      setError(err.message || 'Failed to create credential offer');
    } finally {
      setCreating(false);
    }
  };

  // Reset to create new offer
  const handleNewOffer = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    setCurrentOffer(null);
    setCredentialData({});
    setMdocCredentialData({});
    setSelectedCredDefId('');
  };

  // Copy offer URI to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="badge badge-warning">Pending</span>;
      case 'token_issued':
        return <span className="badge badge-primary">Token Issued</span>;
      case 'credential_request_received':
        return <span className="badge badge-primary">Request Received</span>;
      case 'credential_issued':
        return <span className="badge badge-success">Credential Issued</span>;
      case 'expired':
        return <span className="badge badge-error">Expired</span>;
      default:
        return <span className="badge badge-gray">{status}</span>;
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Issue (OID4VCI)</h1>
          <p className="page-sub">Create credential offers with QR codes for wallet scanning.</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}><span>{error}</span></div>
      )}

      {loading ? (
        <div className="empty"><div className="spinner" style={{ width: 32, height: 32 }} /></div>
      ) : currentOffer ? (
        /* Offer Display */
        <div>
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Credential Offer</h2>
              <p className="text-sm text-text-tertiary">
                Scan this QR code with a wallet to receive the credential
              </p>
            </div>
            {getStatusBadge(currentOffer.status)}
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* QR Code */}
            <div className="flex flex-col items-center">
              <div className="bg-white p-4 rounded-lg border border-border-primary shadow-sm">
                <QRCodeSVG
                  value={currentOffer.offerUri}
                  size={256}
                  level="M"
                  includeMargin={true}
                />
              </div>

              {/* TX Code */}
              {currentOffer.txCode && (
                <div className="mt-4 p-3 rounded-lg text-center" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)' }}>
                  <p className="text-sm text-primary-700 font-medium">Transaction Code</p>
                  <p className="text-2xl font-mono font-bold text-primary-800 tracking-widest mt-1">
                    {currentOffer.txCode}
                  </p>
                  <p className="text-xs text-primary-600 mt-1">Share this code with the recipient</p>
                </div>
              )}
            </div>

            {/* Offer Details */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-text-secondary mb-2">Credential Type</h3>
                <p className="text-text-primary">{selectedCredDef?.overlay?.meta?.name || selectedCredDef?.tag}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-text-secondary mb-2">Offer ID</h3>
                <p className="text-sm font-mono text-text-tertiary break-all">{currentOffer.offerId}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-text-secondary mb-2">Expires At</h3>
                <p className="text-text-primary">
                  {new Date(currentOffer.expiresAt).toLocaleString()}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-text-secondary mb-2">Credential Data</h3>
                <div className="bg-surface-100 rounded-lg p-3 space-y-1">
                  {Object.entries(credentialData).map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-text-tertiary">{key}:</span>
                      <span className="text-text-primary font-medium">{value || '-'}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 space-y-2">
                <button
                  onClick={() => copyToClipboard(currentOffer.offerUri)}
                  className="btn btn-secondary w-full flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy Offer URI
                </button>

                <button
                  onClick={handleNewOffer}
                  className="btn btn-primary w-full"
                >
                  Create New Offer
                </button>
              </div>
            </div>
          </div>

          {/* Wire payload inspector — RI value-add. Always rendered; the
              AnonCreds payloads (blinded_ms / blind signature) are the most
              interesting target for vendor diff comparisons. */}
          <WirePayloadInspector
            offerId={currentOffer.offerId}
            status={currentOffer.status}
          />
        </div>
      ) : credDefs.length === 0 ? (
        /* Empty State */
        <div style={{ padding: 32, textAlign: 'center' }}>
          <div className="w-16 h-16 bg-surface-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-2">No QR-Issuable Credential Definitions</h3>
          <p className="text-text-secondary mb-4">
            Create an SD-JWT VC (OID4VC) or mDL/mdoc credential definition first to issue credentials via QR code.
          </p>
          <Link
            href="/dashboard/credential-definitions"
            className="btn btn-primary inline-flex items-center"
          >
            Go to Credential Definitions
          </Link>
        </div>
      ) : (
        /* Create Offer Form */
        <form onSubmit={handleCreateOffer} style={{ padding: 0 }}>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Create Credential Offer</h2>

          {/* Credential Definition Selector */}
          <div className="mb-4">
            <label className="form-label">
              Credential Definition
            </label>
            <select
              value={selectedCredDefId}
              onChange={(e) => {
                setSelectedCredDefId(e.target.value);
                // Reset credential data when changing definition
                setCredentialData({});
                setMdocCredentialData({});
              }}
              className="input w-full"
              required
            >
              <option value="">Select a credential definition</option>
              {credDefs.map((cd) => {
                const formatLabel =
                  cd.format === 'mso_mdoc' ? 'mDL/mdoc'
                  : cd.format === 'anoncreds' ? 'AnonCreds'
                  : cd.format === 'openbadge_v3' ? 'OBv3'
                  : cd.format === 'jwt_vc_json' ? 'jwt_vc_json'
                  : cd.format === 'jwt_vc_json-ld' ? 'jwt_vc_json-ld'
                  : cd.format === 'ldp_vc' ? 'ldp_vc'
                  : 'SD-JWT';
                // Build the human label by combining (in priority order):
                // OCA meta name → schema name+version → tag.
                const schema = cd.schemaId ? schemasById[cd.schemaId] : undefined;
                const schemaLabel = schema?.name
                  ? `${schema.name}${schema.version ? ` v${schema.version}` : ''}`
                  : ''
                const friendly =
                  cd.overlay?.meta?.name ||
                  schemaLabel ||
                  cd.tag
                const suffix =
                  schemaLabel && cd.overlay?.meta?.name && schemaLabel !== cd.overlay.meta.name
                    ? ` · ${schemaLabel}`
                    : ''
                return (
                  <option key={cd.credentialDefinitionId} value={cd.credentialDefinitionId}>
                    [{formatLabel}] {friendly}{suffix} · {cd.tag}
                  </option>
                );
              })}
            </select>
            {selectedCredDef && (
              <div className="mt-2 flex items-center gap-2">
                <span className={`badge ${
                  selectedCredDef.format === 'mso_mdoc' ? 'badge-success'
                  : selectedCredDef.format === 'anoncreds' ? 'badge-warning'
                  : selectedCredDef.format === 'openbadge_v3' ? 'badge-info'
                  : 'badge-primary'
                }`}>
                  {selectedCredDef.format === 'mso_mdoc' ? 'mDL/mdoc'
                    : selectedCredDef.format === 'anoncreds' ? 'AnonCreds (CL)'
                    : selectedCredDef.format === 'openbadge_v3' ? 'OpenBadges v3 (ldp_vc)'
                    : selectedCredDef.format === 'jwt_vc_json' ? 'W3C VC-JWT'
                    : selectedCredDef.format === 'jwt_vc_json-ld' ? 'W3C VC-JWT (JSON-LD)'
                    : selectedCredDef.format === 'ldp_vc' ? 'W3C Linked Data Proof VC'
                    : 'SD-JWT VC'}
                </span>
                {selectedCredDef.format === 'mso_mdoc' && selectedCredDef.doctype && (
                  <span className="text-xs text-text-tertiary font-mono">
                    {selectedCredDef.doctype.split('.').pop()}
                  </span>
                )}
                {(() => {
                  const schema = selectedCredDef.schemaId
                    ? schemasById[selectedCredDef.schemaId]
                    : undefined
                  if (!schema?.name) return null
                  return (
                    <span className="text-xs text-text-tertiary">
                      Schema: <span className="font-medium text-text-secondary">{schema.name}</span>
                      {schema.version && <span className="ml-1 font-mono">v{schema.version}</span>}
                    </span>
                  )
                })()}
              </div>
            )}
          </div>

          {/* Credential Data Fields - SD-JWT VC format */}
          {selectedCredDef?.format === 'oid4vc' && selectedCredDef?.schemaAttributes && selectedCredDef.schemaAttributes.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-text-secondary mb-3">Credential Attributes</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedCredDef.schemaAttributes.map((attr) => (
                  <div key={attr}>
                    <label className="block text-xs text-text-tertiary mb-1">{attr}</label>
                    <input
                      type="text"
                      value={credentialData[attr] || ''}
                      onChange={(e) => setCredentialData({
                        ...credentialData,
                        [attr]: e.target.value,
                      })}
                      className="input w-full"
                      placeholder={`Enter ${attr}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Credential Data Fields - AnonCreds format (spec §6) */}
          {selectedCredDef?.format === 'anoncreds' && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-text-secondary mb-3">AnonCreds Attributes</h3>
              <AnonCredsIssuanceForm
                attributes={selectedCredDef.schemaAttributes || []}
                values={credentialData}
                onChange={setCredentialData}
              />
            </div>
          )}

          {/* Credential Data Fields - OpenBadges v3 */}
          {selectedCredDef?.format === 'openbadge_v3' && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-text-secondary mb-3">OpenBadge recipient</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-text-tertiary mb-1">Recipient name</label>
                  <input
                    type="text"
                    value={credentialData.recipientName || ''}
                    onChange={(e) => setCredentialData({ ...credentialData, recipientName: e.target.value })}
                    className="input w-full"
                    placeholder="Alice Doe"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-tertiary mb-1">Recipient DID (optional)</label>
                  <input
                    type="text"
                    value={credentialData.recipientDid || ''}
                    onChange={(e) => setCredentialData({ ...credentialData, recipientDid: e.target.value })}
                    className="input w-full"
                    placeholder="did:key:... or did:jwk:..."
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-tertiary mb-1">Achievement name (override)</label>
                  <input
                    type="text"
                    value={credentialData.achievementName || ''}
                    onChange={(e) => setCredentialData({ ...credentialData, achievementName: e.target.value })}
                    className="input w-full"
                    placeholder="Leave blank to use cred-def template"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-tertiary mb-1">Achievement type (override)</label>
                  <input
                    type="text"
                    value={credentialData.achievementType || ''}
                    onChange={(e) => setCredentialData({ ...credentialData, achievementType: e.target.value })}
                    className="input w-full"
                    placeholder="Badge / Certificate / Degree"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-text-tertiary mb-1">Achievement description (override)</label>
                  <input
                    type="text"
                    value={credentialData.achievementDescription || ''}
                    onChange={(e) => setCredentialData({ ...credentialData, achievementDescription: e.target.value })}
                    className="input w-full"
                    placeholder="Optional per-offer override"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-text-tertiary mb-1">Achievement criteria (override)</label>
                  <textarea
                    value={credentialData.achievementCriteria || ''}
                    onChange={(e) => setCredentialData({ ...credentialData, achievementCriteria: e.target.value })}
                    className="input w-full"
                    rows={2}
                    placeholder="Optional per-offer override"
                  />
                </div>
                {(selectedCredDef.schemaAttributes || []).map((attr) => (
                  <div key={attr}>
                    <label className="block text-xs text-text-tertiary mb-1">{attr}</label>
                    <input
                      type="text"
                      value={credentialData[attr] || ''}
                      onChange={(e) => setCredentialData({ ...credentialData, [attr]: e.target.value })}
                      className="input w-full"
                      placeholder={`Enter ${attr}`}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-text-tertiary mt-2">
                Achievement metadata is baked into this credential definition — only recipient-specific fields are needed per offer.
              </p>
            </div>
          )}

          {/* Credential Data Fields - generic W3C VC formats */}
          {(selectedCredDef?.format === 'jwt_vc_json' ||
            selectedCredDef?.format === 'jwt_vc_json-ld' ||
            selectedCredDef?.format === 'ldp_vc') &&
            (selectedCredDef.schemaAttributes || []).length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-text-secondary mb-3">credentialSubject attributes</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(selectedCredDef.schemaAttributes || []).map((attr) => (
                  <div key={attr}>
                    <label className="block text-xs text-text-tertiary mb-1">{attr}</label>
                    <input
                      type="text"
                      value={credentialData[attr] || ''}
                      onChange={(e) => setCredentialData({ ...credentialData, [attr]: e.target.value })}
                      className="input w-full"
                      placeholder={`Enter ${attr}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Credential Data Fields - mdoc format */}
          {selectedCredDef?.format === 'mso_mdoc' && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-text-secondary mb-3">
                {selectedCredDef.doctype?.includes('mDL') ? "Driver's License" : 'Mobile Document'} Information
              </h3>
              <div className="border border-border-primary rounded-lg p-4 bg-surface-100">
                <MdlIssuanceForm
                  doctype={selectedCredDef.doctype || 'org.iso.18013.5.1.mDL'}
                  selectedAttributes={
                    selectedCredDef.namespaces
                      ? Object.values(selectedCredDef.namespaces).flatMap(ns => Object.keys(ns))
                      : []
                  }
                  onDataChange={setMdocCredentialData}
                  initialData={mdocCredentialData}
                />
              </div>
            </div>
          )}

          {/* TX Code Option */}
          <div className="mb-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={txCodeRequired}
                onChange={(e) => setTxCodeRequired(e.target.checked)}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-border-primary rounded"
              />
              <span className="text-sm text-text-secondary">Require transaction code (PIN)</span>
            </label>
            <p className="text-xs text-text-tertiary mt-1 ml-6">
              If enabled, the recipient will need to enter a PIN to receive the credential
            </p>
          </div>

          <button
            type="submit"
            disabled={creating || !selectedCredDefId}
            className="btn btn-primary w-full"
          >
            {creating ? 'Creating Offer...' : 'Generate QR Code'}
          </button>
        </form>
      )}
    </div>
  );
}
