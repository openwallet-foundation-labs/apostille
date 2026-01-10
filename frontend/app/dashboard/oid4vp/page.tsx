'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { credentialDefinitionApi, oid4vpApi } from '../../../lib/api';
import { QRCodeSVG } from 'qrcode.react';

interface CredentialDefinition {
  id: string;
  credentialDefinitionId: string;
  schemaId: string;
  tag: string;
  format?: 'anoncreds' | 'oid4vc';
  schemaAttributes?: string[];
  overlay?: {
    meta?: {
      name?: string;
      description?: string;
    };
  };
}

interface VerificationSession {
  sessionId: string;
  authorizationRequestUri: string;
  expiresAt: string;
  status: 'pending' | 'received' | 'verified' | 'failed';
  verifiedClaims?: Record<string, any>;
}

export default function OID4VPPage() {
  const { tenantId } = useAuth();
  const [credDefs, setCredDefs] = useState<CredentialDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [selectedCredTypes, setSelectedCredTypes] = useState<string[]>([]);
  const [requestedAttributes, setRequestedAttributes] = useState<string[]>([]);
  const [purpose, setPurpose] = useState('');
  const [creating, setCreating] = useState(false);

  // Session state
  const [currentSession, setCurrentSession] = useState<VerificationSession | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Fetch credential definitions
  useEffect(() => {
    const fetchCredDefs = async () => {
      if (!tenantId) return;

      setLoading(true);
      try {
        const response = await credentialDefinitionApi.getAll();
        const allCredDefs = response.credentialDefinitions || [];

        // Filter to only show OID4VC credential definitions for verification
        const oid4vcCredDefs = allCredDefs.filter(
          (cd: CredentialDefinition) => cd.format === 'oid4vc'
        );

        setCredDefs(oid4vcCredDefs);
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

  // Get all available attributes from selected credential types
  const availableAttributes = selectedCredTypes.flatMap(type => {
    const credDef = credDefs.find(cd => cd.tag === type);
    return credDef?.schemaAttributes || [];
  });
  const uniqueAttributes = [...new Set(availableAttributes)];

  // Poll for session status
  const pollSessionStatus = useCallback(async (sessionId: string) => {
    try {
      const response = await oid4vpApi.getSessionStatus(sessionId);
      if (response.success) {
        setCurrentSession(prev => prev ? {
          ...prev,
          status: response.status,
          verifiedClaims: response.verifiedClaims,
        } : null);

        // Stop polling if verified or failed
        if (response.status === 'verified' || response.status === 'failed') {
          if (pollingInterval) {
            clearInterval(pollingInterval);
            setPollingInterval(null);
          }
        }
      }
    } catch (err) {
      console.error('Error polling session status:', err);
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

  // Create verification request
  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCredTypes.length === 0) return;

    setCreating(true);
    setError(null);

    try {
      const response = await oid4vpApi.createAuthorizationRequest({
        credentialTypes: selectedCredTypes,
        requestedAttributes: requestedAttributes.length > 0 ? requestedAttributes : undefined,
        purpose: purpose || 'Verification request',
      });

      if (response.success) {
        setCurrentSession({
          sessionId: response.sessionId,
          authorizationRequestUri: response.authorizationRequestUri,
          expiresAt: response.expiresAt,
          status: 'pending',
        });

        // Start polling for status updates
        const interval = setInterval(() => {
          pollSessionStatus(response.sessionId);
        }, 2000);
        setPollingInterval(interval);
      }
    } catch (err: any) {
      console.error('Error creating verification request:', err);
      setError(err.message || 'Failed to create verification request');
    } finally {
      setCreating(false);
    }
  };

  // Reset to create new request
  const handleNewRequest = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    setCurrentSession(null);
    setSelectedCredTypes([]);
    setRequestedAttributes([]);
    setPurpose('');
  };

  // Copy URI to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="badge badge-warning">Waiting for Response</span>;
      case 'received':
        return <span className="badge badge-primary">Processing</span>;
      case 'verified':
        return <span className="badge badge-success">Verified</span>;
      case 'failed':
        return <span className="badge badge-error">Failed</span>;
      default:
        return <span className="badge badge-gray">{status}</span>;
    }
  };

  const toggleCredType = (type: string) => {
    setSelectedCredTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const toggleAttribute = (attr: string) => {
    setRequestedAttributes(prev =>
      prev.includes(attr)
        ? prev.filter(a => a !== attr)
        : [...prev, attr]
    );
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-error-100 border border-error-300 text-error-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
          <p className="text-text-secondary">Loading credential types...</p>
        </div>
      ) : currentSession ? (
        /* Session Display */
        <div className="card p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Verification Request</h2>
              <p className="text-sm text-text-tertiary">
                {currentSession.status === 'verified'
                  ? 'Credential verification successful!'
                  : 'Scan this QR code with a wallet to present credentials'}
              </p>
            </div>
            {getStatusBadge(currentSession.status)}
          </div>

          {currentSession.status === 'verified' && currentSession.verifiedClaims ? (
            /* Verified Claims Display */
            <div className="space-y-6">
              <div className="bg-success-100 border border-success-300 rounded-lg p-4">
                <div className="flex items-center gap-2 text-success-700 mb-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-medium">Verification Successful</span>
                </div>
                <p className="text-sm text-success-600">
                  The holder has successfully presented valid credentials.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-text-secondary mb-3">Verified Claims</h3>
                <div className="bg-surface-100 rounded-lg p-4 space-y-2">
                  {Object.entries(currentSession.verifiedClaims).map(([key, value]) => (
                    <div key={key} className="flex justify-between py-2 border-b border-border-secondary last:border-0">
                      <span className="text-text-tertiary font-medium">{key}</span>
                      <span className="text-text-primary">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleNewRequest}
                className="btn btn-primary w-full"
              >
                Create New Verification Request
              </button>
            </div>
          ) : (
            /* QR Code Display */
            <div className="grid md:grid-cols-2 gap-8">
              <div className="flex flex-col items-center">
                <div className="bg-white p-4 rounded-lg border border-border-primary shadow-sm">
                  <QRCodeSVG
                    value={currentSession.authorizationRequestUri}
                    size={256}
                    level="M"
                    includeMargin={true}
                  />
                </div>

                <p className="mt-4 text-sm text-text-tertiary text-center">
                  Waiting for wallet to present credentials...
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-text-secondary mb-2">Session ID</h3>
                  <p className="text-sm font-mono text-text-tertiary break-all">{currentSession.sessionId}</p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-text-secondary mb-2">Requested Credentials</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedCredTypes.map(type => (
                      <span key={type} className="badge badge-primary">
                        {type}
                      </span>
                    ))}
                  </div>
                </div>

                {requestedAttributes.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-text-secondary mb-2">Requested Attributes</h3>
                    <div className="flex flex-wrap gap-2">
                      {requestedAttributes.map(attr => (
                        <span key={attr} className="badge badge-gray">
                          {attr}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-medium text-text-secondary mb-2">Expires At</h3>
                  <p className="text-text-primary">
                    {new Date(currentSession.expiresAt).toLocaleString()}
                  </p>
                </div>

                <div className="pt-4 space-y-2">
                  <button
                    onClick={() => copyToClipboard(currentSession.authorizationRequestUri)}
                    className="btn btn-secondary w-full flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy Request URI
                  </button>

                  <button
                    onClick={handleNewRequest}
                    className="btn btn-ghost w-full"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : credDefs.length === 0 ? (
        /* Empty State */
        <div className="card p-8 text-center">
          <div className="w-16 h-16 bg-surface-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-2">No OID4VC Credential Types</h3>
          <p className="text-text-secondary mb-4">
            Create OID4VC credential definitions to verify credentials via QR code.
          </p>
          <a
            href="/credential-definitions"
            className="btn btn-primary inline-flex items-center"
          >
            Go to Credential Definitions
          </a>
        </div>
      ) : (
        /* Create Request Form */
        <form onSubmit={handleCreateRequest} className="card p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Create Verification Request</h2>

          {/* Credential Type Selector */}
          <div className="mb-6">
            <label className="form-label">
              Credential Types to Verify
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {credDefs.map((cd) => (
                <label
                  key={cd.credentialDefinitionId}
                  className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedCredTypes.includes(cd.tag)
                      ? 'border-primary-500 bg-primary-100'
                      : 'border-border-secondary hover:border-border-primary'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedCredTypes.includes(cd.tag)}
                    onChange={() => toggleCredType(cd.tag)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-border-primary rounded"
                  />
                  <span className="text-sm text-text-primary">{cd.overlay?.meta?.name || cd.tag}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Attribute Selector */}
          {uniqueAttributes.length > 0 && (
            <div className="mb-6">
              <label className="form-label">
                Specific Attributes to Request (Optional)
              </label>
              <p className="text-xs text-text-tertiary mb-2">
                Leave empty to request all attributes, or select specific ones
              </p>
              <div className="flex flex-wrap gap-2">
                {uniqueAttributes.map((attr) => (
                  <label
                    key={attr}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-full cursor-pointer transition-colors text-sm ${
                      requestedAttributes.includes(attr)
                        ? 'border-primary-500 bg-primary-100 text-primary-700'
                        : 'border-border-secondary text-text-secondary hover:border-border-primary'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={requestedAttributes.includes(attr)}
                      onChange={() => toggleAttribute(attr)}
                      className="sr-only"
                    />
                    {attr}
                    {requestedAttributes.includes(attr) && (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Purpose */}
          <div className="mb-6">
            <label className="form-label">
              Verification Purpose
            </label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="input w-full"
              placeholder="e.g., Age verification for service access"
            />
          </div>

          <button
            type="submit"
            disabled={creating || selectedCredTypes.length === 0}
            className="btn btn-primary w-full"
          >
            {creating ? 'Creating Request...' : 'Generate Verification QR Code'}
          </button>
        </form>
      )}
    </div>
  );
}
