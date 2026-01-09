'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { credentialApi, credentialDefinitionApi, connectionApi, schemaApi } from '../../../lib/api';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';

interface Credential {
  id: string;
  state: string;
  createdAt: string;
  connectionId: string;
  credentialDefinitionId?: string;
  attributes?: Record<string, string>;
  metadata?: any;
  threadId?: string;
  revocationId?: string;
  updatedAt?: string;
}

interface Connection {
  id: string;
  state: string;
  role: string;
  theirLabel?: string;
  createdAt: string;
}

interface CredentialDefinition {
  id: string;
  credentialDefinitionId: string;
  createdAt?: string;
  schemaId?: string;
}

export default function CredentialsPage() {
  const { tenantId } = useAuth();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Issue credential states
  const [showIssueModal, setShowIssueModal] = useState<boolean>(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [credentialDefinitions, setCredentialDefinitions] = useState<CredentialDefinition[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [selectedCredDefId, setSelectedCredDefId] = useState<string>('');
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [schemaAttributes, setSchemaAttributes] = useState<string[]>([]);
  const [isIssuing, setIsIssuing] = useState<boolean>(false);
  const [issueSuccess, setIssueSuccess] = useState<boolean>(false);
  
  // Credential details modal states
  const [selectedCredential, setSelectedCredential] = useState<Credential | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);
  const [credentialDetails, setCredentialDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  useEffect(() => {
    const fetchCredentials = async () => {
      if (!tenantId) return;
      
      setLoading(true);
      try {
        const response = await credentialApi.getAll();
        setCredentials(response.credentials || []);
        setError(null);
      } catch (err: any) {
        console.error('Error fetching credentials:', err);
        setError(err.message || 'Failed to fetch credentials');
      } finally {
        setLoading(false);
      }
    };

    fetchCredentials();
  }, [tenantId]);

  const fetchConnections = async () => {
    if (!tenantId) return;
    
    try {
      const response = await connectionApi.getAll();
      // Filter for active connections
      setConnections(response.connections?.filter(
        (conn: Connection) => conn.state === 'completed'
      ) || []);
    } catch (err: any) {
      console.error('Error fetching connections:', err);
      setError(err.message || 'Failed to fetch connections');
    }
  };

  const fetchCredentialDefinitions = async () => {
    
    try {
      const response = await credentialDefinitionApi.getAll();
      setCredentialDefinitions(response.credentialDefinitions || []);
    } catch (err: any) {
      console.error('Error fetching credential definitions:', err);
      setError(err.message || 'Failed to fetch credential definitions');
    }
  };

  const openIssueModal = async () => {
    if (!tenantId) return;
    
    setError(null);
    setIssueSuccess(false);
    setSelectedConnectionId('');
    setSelectedCredDefId('');
    setAttributes({});
    setSchemaAttributes([]);
    
    await Promise.all([
      fetchConnections(),
      fetchCredentialDefinitions()
    ]);
    
    setShowIssueModal(true);
  };

  const closeIssueModal = () => {
    setShowIssueModal(false);
    setSelectedConnectionId('');
    setSelectedCredDefId('');
    setAttributes({});
    setSchemaAttributes([]);
  };

  const handleCredDefChange = async (credDefId: string) => {
    if (!tenantId || !credDefId) {
      setSchemaAttributes([]);
      setAttributes({});
      return;
    }
    
    setSelectedCredDefId(credDefId);
    setError(null);
    
    try {
      console.log(`Fetching credential definition: ${credDefId}`);
      const credDefResponse = await credentialDefinitionApi.getById(credDefId);
      console.log('Credential definition response:', credDefResponse);
      
      if (!credDefResponse || !credDefResponse.credentialDefinition || !credDefResponse.schemaId) {
        console.error('Invalid credential definition response:', credDefResponse);
        setError('Could not retrieve schema information from credential definition');
        return;
      }
      
      const schemaId = credDefResponse.schemaId;
      console.log(`Fetching schema: ${schemaId}`);
      
      try {
        const schemaData = await schemaApi.getBySchemaId(schemaId);
        console.log('Schema data:', schemaData);
        
        if (schemaData.success && schemaData.schema) {
          const attrNames = schemaData.schema.schema.attrNames || [];
          console.log('Schema attributes:', attrNames);
          setSchemaAttributes(attrNames);
          
          // Initialize attributes with empty values
          const newAttributes: Record<string, string> = {};
          attrNames.forEach((attr: string) => {
            newAttributes[attr] = '';
          });
          
          setAttributes(newAttributes);
        } else {
          console.error('Schema data error:', schemaData);
          setError(`Could not retrieve schema attributes: ${schemaData.message || 'Unknown error'}`);
        }
      } catch (schemaErr: any) {
        console.error(`Error fetching schema with ID ${schemaId}:`, schemaErr);
        setError(`Failed to fetch schema: ${schemaErr.message || 'Unknown error'}`);
      }
    } catch (err: any) {
      console.error(`Error fetching credential definition ${credDefId}:`, err);
      setError(`Failed to fetch credential definition: ${err.message || 'Unknown error'}`);
    }
  };

  const handleAttributeChange = (attr: string, value: string) => {
    setAttributes(prev => ({
      ...prev,
      [attr]: value
    }));
  };

  const handleIssueCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!tenantId || !selectedConnectionId || !selectedCredDefId) {
      setError('Connection and credential definition are required');
      return;
    }
    
    setIsIssuing(true);
    setError(null);
    
    try {
      await credentialApi.issue(
        selectedConnectionId,
        selectedCredDefId,
        attributes
      );
      
      setIssueSuccess(true);
      
      // Refresh credentials list
      const response = await credentialApi.getAll();
      
      setCredentials(response.credentials || []);
      
      // Close modal after short delay
      setTimeout(() => {
        closeIssueModal();
      }, 1500);
    } catch (err: any) {
      console.error('Error issuing credential:', err);
      setError(err.message || 'Failed to issue credential');
    } finally {
      setIsIssuing(false);
    }
  };

  const openDetailsModal = async (credential: Credential) => {
    setSelectedCredential(credential);
    setIsDetailsOpen(true);
    setLoadingDetails(true);
    
    try {
      // Fetch detailed credential information
      const detailedCredential = await credentialApi.getById(credential.id);
      console.log('Detailed credential:', detailedCredential);
      
      // Debug: Log the structure of the credential attributes
      if (detailedCredential && detailedCredential.credential && detailedCredential.credential.attributes) {
        console.log('Credential attributes structure:', JSON.stringify(detailedCredential.credential.attributes, null, 2));
        
        // Inspect each attribute for complex objects
        Object.entries(detailedCredential.credential.attributes).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null) {
            console.log(`Complex attribute "${key}":`, value);
          }
        });
      }
      
      setCredentialDetails(detailedCredential);
      
      // If there's a credential definition ID, try to get schema info
      if (credential.credentialDefinitionId) {
        try {
          const credDefResponse = await credentialDefinitionApi.getById(credential.credentialDefinitionId);
          console.log('Associated credential definition:', credDefResponse);
          
          if (credDefResponse && credDefResponse.schemaId) {
            const schemaResponse = await schemaApi.getBySchemaId(credDefResponse.schemaId);
            console.log('Associated schema:', schemaResponse);
          }
        } catch (e) {
          console.warn('Could not fetch associated schema/credential definition:', e);
        }
      }
    } catch (err) {
      console.error('Error fetching credential details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };
  
  const closeDetailsModal = () => {
    setSelectedCredential(null);
    setIsDetailsOpen(false);
    setCredentialDetails(null);
  };

  // Helper function to safely render credential attribute values
  const renderAttributeValue = (value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-text-tertiary italic">None</span>;
    }
    
    // For primitive types, just convert to string
    if (typeof value !== 'object') {
      return String(value);
    }
    
    // For objects, render appropriate representation
    try {
      // Handle special case for AnonCreds formatted attributes
      if ('mime-type' in value) {
        return (
          <div>
            <div className="text-xs text-text-tertiary mb-1">Format: {value['mime-type']}</div>
            {value.name && <div className="text-xs text-text-tertiary mb-1">Name: {value.name}</div>}
            <div className="text-xs font-medium">Value:</div>
            <div className="pl-2 border-l-2 border-border-secondary">
              {typeof value.value === 'object' ? 
                <pre className="text-xs overflow-auto max-h-20">{JSON.stringify(value.value, null, 2)}</pre> : 
                String(value.value || '')}
            </div>
          </div>
        );
      }
      
      // Handle objects with a value property
      if ('value' in value && !('mime-type' in value)) {
        return (
          <div>
            <div>Value: {typeof value.value === 'object' ? 
              <pre className="text-xs overflow-auto max-h-20">{JSON.stringify(value.value, null, 2)}</pre> : 
              String(value.value || '')}
            </div>
            {Object.entries(value)
              .filter(([k]) => k !== 'value')
              .map(([k, v]) => (
                <div key={k} className="text-xs text-text-tertiary">{k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}</div>
              ))}
          </div>
        );
      }
      
      // Default object rendering
      return <pre className="text-xs overflow-auto max-h-24">{JSON.stringify(value, null, 2)}</pre>;
    } catch (e) {
      console.error("Error rendering attribute value:", e);
      return <span className="text-red-500">Error displaying value</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex justify-end">
        <button
          onClick={openIssueModal}
          className="btn btn-primary"
        >
          Issue Credential
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col justify-center items-center py-12">
          <div className="spinner h-12 w-12 mb-4"></div>
          <p className="text-text-secondary">Loading credentials...</p>
        </div>
      ) : credentials.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border-primary">
              <thead className="bg-surface-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">State</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Created At</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Connection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-primary">
                {credentials.map((credential) => (
                  <tr key={credential.id} 
                      className="hover:bg-surface-200 cursor-pointer transition-colors duration-200" 
                      onClick={() => openDetailsModal(credential)}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary truncate max-w-sm">{credential.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`badge ${
                        credential.state === 'offer-received' ? 'badge-warning' :
                        credential.state === 'done' ? 'badge-success' :
                        'badge-primary'
                      }`}>
                        {credential.state}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                      {new Date(credential.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary truncate max-w-sm">{credential.connectionId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="empty-state-card">
          <div className="empty-state-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <h3 className="empty-state-title">No credentials found</h3>
          <p className="empty-state-description">You can issue or receive credentials after creating connections.</p>
          <div className="mt-6">
            <button
              onClick={openIssueModal}
              className="btn btn-primary"
            >
              Issue Your First Credential
            </button>
          </div>
        </div>
      )}

      {/* Issue Credential Modal */}
      {showIssueModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center" style={{ zIndex: 9999 }}>
          <div className="modal-container max-w-2xl">
            <div className="modal-header">
              <h2 className="modal-title">Issue New Credential</h2>
              <button
                onClick={closeIssueModal}
                className="modal-close-button"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="modal-body">
              {issueSuccess ? (
                <div className="alert alert-success mb-4">
                  <span>Credential issued successfully!</span>
                </div>
              ) : (
                <form onSubmit={handleIssueCredential} className="space-y-4">
                  <div>
                    <label className="form-label">
                      Connection
                    </label>
                    <select
                      value={selectedConnectionId}
                      onChange={(e) => setSelectedConnectionId(e.target.value)}
                      className="form-select"
                      required
                    >
                      <option value="">Select Connection</option>
                      {connections.map((conn) => (
                        <option key={conn.id} value={conn.id}>
                          {conn.theirLabel || 'Unknown'} ({conn.id.substring(0, 8)}...)
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="form-label">
                      Credential Definition
                    </label>
                    <select
                      value={selectedCredDefId}
                      onChange={(e) => handleCredDefChange(e.target.value)}
                      className="form-select"
                      required
                    >
                      <option value="">Select Credential Definition</option>
                      {credentialDefinitions.map((credDef) => (
                        <option key={credDef.id} value={credDef.credentialDefinitionId}>
                          {credDef.credentialDefinitionId}...
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {schemaAttributes.length > 0 && (
                    <div>
                      <h3 className="form-label">
                        Credential Attributes
                      </h3>
                      
                      {schemaAttributes.map((attr) => (
                        <div key={attr} className="mb-3">
                          <label className="form-label">
                            {attr}
                          </label>
                          <input
                            type="text"
                            value={attributes[attr] || ''}
                            onChange={(e) => handleAttributeChange(attr, e.target.value)}
                            className="form-input"
                            placeholder={`Enter ${attr}`}
                            required
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={closeIssueModal}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isIssuing || !selectedConnectionId || !selectedCredDefId || schemaAttributes.length === 0}
                      className="btn btn-primary"
                    >
                      {isIssuing ? (
                        <>
                          <div className="spinner h-4 w-4 mr-2"></div>
                          Issuing...
                        </>
                      ) : (
                        'Issue Credential'
                      )}
                    </button>
                  </div>
                  
                  {error && (
                    <div className="alert alert-error mt-4">
                      <span>{error}</span>
                    </div>
                  )}
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Credential Details Modal */}
      <Transition appear show={isDetailsOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={closeDetailsModal}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/50" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="modal-container max-w-3xl transform overflow-hidden text-left align-middle transition-all">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-text-primary mb-4">
                    Credential Details
                  </Dialog.Title>

                  {loadingDetails ? (
                    <div className="flex justify-center items-center p-8">
                      <div className="spinner h-8 w-8"></div>
                      <span className="ml-2 text-sm text-text-secondary">Loading credential details...</span>
                    </div>
                  ) : selectedCredential ? (
                    <div>
                      <div className="mb-6 grid grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-sm font-semibold text-text-primary mb-1">ID</h4>
                          <p className="text-sm text-text-secondary break-all">{selectedCredential.id}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-text-primary mb-1">State</h4>
                          <p className="text-sm text-text-secondary break-all">
                            <span className={`badge ${
                              selectedCredential.state === 'offer-received' ? 'badge-warning' :
                              selectedCredential.state === 'done' ? 'badge-success' :
                              'badge-primary'
                            }`}>
                              {selectedCredential.state}
                            </span>
                          </p>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-text-primary mb-1">Connection ID</h4>
                          <p className="text-sm text-text-secondary break-all">{selectedCredential.connectionId}</p>
                        </div>
                        {selectedCredential.credentialDefinitionId && (
                          <div>
                            <h4 className="text-sm font-semibold text-text-primary mb-1">Credential Definition ID</h4>
                            <p className="text-sm text-text-secondary break-all">{selectedCredential.credentialDefinitionId}</p>
                          </div>
                        )}
                        <div>
                          <h4 className="text-sm font-semibold text-text-primary mb-1">Created At</h4>
                          <p className="text-sm text-text-secondary">
                            {new Date(selectedCredential.createdAt).toLocaleString()}
                          </p>
                        </div>
                        {selectedCredential.updatedAt && (
                          <div>
                            <h4 className="text-sm font-semibold text-text-secondary mb-1">Updated At</h4>
                            <p className="text-sm text-text-tertiary">
                              {new Date(selectedCredential.updatedAt).toLocaleString()}
                            </p>
                          </div>
                        )}
                        {selectedCredential.threadId && (
                          <div>
                            <h4 className="text-sm font-semibold text-text-secondary mb-1">Thread ID</h4>
                            <p className="text-sm text-text-tertiary break-all">{selectedCredential.threadId}</p>
                          </div>
                        )}
                        {selectedCredential.revocationId && (
                          <div>
                            <h4 className="text-sm font-semibold text-text-secondary mb-1">Revocation ID</h4>
                            <p className="text-sm text-text-tertiary">{selectedCredential.revocationId}</p>
                          </div>
                        )}
                      </div>

                      {/* Credential Attributes Section */}
                      {credentialDetails && credentialDetails.credential && (
                        <>
                          {/* Display credential content */}
                          {credentialDetails.credential.attributes && (
                            <div className="mt-6">
                              <h4 className="text-sm font-semibold text-text-secondary mb-2">Credential Attributes</h4>
                              <div className="bg-surface-100 p-4 rounded border border-border-secondary">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {Object.entries(credentialDetails.credential.attributes).map(([key, value]: [string, any]) => (
                                    <div key={key} className="p-3 bg-surface-50 rounded shadow-sm">
                                      <h5 className="text-sm font-semibold text-text-secondary mb-2 border-b border-border-secondary pb-1">{key}</h5>
                                      <div className="text-sm text-text-secondary">
                                        {renderAttributeValue(value)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Raw credential data for debugging */}
                          <div className="mt-6">
                            <h4 className="text-sm font-semibold text-text-secondary mb-2">
                              <span>Raw Credential Data</span>
                              <button
                                onClick={() => console.log('Full credential data:', credentialDetails)}
                                className="ml-2 text-xs text-primary-600 hover:text-primary-700"
                              >
                                Log to Console
                              </button>
                            </h4>
                            <div className="bg-surface-100 p-2 rounded border border-border-secondary">
                              <pre className="text-xs overflow-auto max-h-40 text-text-secondary">
                                {JSON.stringify(
                                  {
                                    ...credentialDetails.credential,
                                    // Exclude large binary data if present
                                    _data: credentialDetails.credential._data ? "[Binary data]" : undefined
                                  },
                                  null, 2
                                )}
                              </pre>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Metadata Section */}
                      {selectedCredential.metadata && Object.keys(selectedCredential.metadata).length > 0 && (
                        <div className="mt-6">
                          <h4 className="text-sm font-semibold text-text-secondary mb-2">Metadata</h4>
                          <div className="bg-surface-100 p-4 rounded border border-border-secondary">
                            <pre className="text-xs text-text-secondary overflow-auto max-h-40">
                              {JSON.stringify(selectedCredential.metadata, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}

                      <div className="mt-6 flex justify-end">
                        <button
                          type="button"
                          onClick={closeDetailsModal}
                          className="btn btn-primary"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                                      ) : (
                    <p className="text-sm text-text-tertiary p-4">No credential information available.</p>
                  )}
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
} 