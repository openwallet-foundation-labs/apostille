'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { schemaApi, didApi } from '../../../lib/api';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';

interface Schema {
  id: string;
  schemaId: string;
  methodName: string;
  createdAt: string;
  updatedAt: string;
  schema: {
    name: string;
    version: string;
    attrNames: string[];
    issuerId: string;
  };
  _tags?: {
    issuerId: string;
    methodName: string;
    schemaId: string;
    schemaName: string;
    schemaVersion: string;
  };
  metadata: Record<string, any>;
}

interface Did {
  did: string;
  method: string;
  createdAt: string;
}

export default function SchemasPage() {
  const { tenantId } = useAuth();
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [schemaName, setSchemaName] = useState<string>('');
  const [schemaVersion, setSchemaVersion] = useState<string>('1.0');
  const [attributes, setAttributes] = useState<string[]>(['']);
  const [creating, setCreating] = useState<boolean>(false);
  const [provider, setProvider] = useState<string>('cheqd');
  const [selectedSchema, setSelectedSchema] = useState<Schema | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState<boolean>(false);
  const [availableDids, setAvailableDids] = useState<Did[]>([]);
  const [selectedIssuerId, setSelectedIssuerId] = useState<string>('');
  const [loadingDids, setLoadingDids] = useState<boolean>(false);
  const [didsByType, setDidsByType] = useState<Record<string, Did[]>>({});

  useEffect(() => {
    const fetchSchemas = async () => {
      if (!tenantId) return;
      
      setLoading(true);
      try {
        const response = await schemaApi.getAll();
        console.log('response', response);

        setSchemas(Array.isArray(response) ? response : (response.schemas || []));
        setError(null);
      } catch (err: any) {
        console.error('Error fetching schemas:', err);
        setError(err.message || 'Failed to fetch schemas');
      } finally {
        setLoading(false);
      }
    };

    fetchSchemas();
  }, [tenantId]);

  // Fetch available DIDs when opening the modal
  const fetchAvailableDids = async () => {
    if (!tenantId) return;
    
    setLoadingDids(true);
    try {
      const response = await didApi.getAll();
      console.log('Available DIDs:', response);
      
      // Handle the response format
      if (response && response.dids) {
        const dids = response.dids.map((did: any) => ({
          did: did.did,
          method: did.method || did.did.split(':')[1],
          createdAt: did.createdAt
        }));
        
        setAvailableDids(dids);
        
        // Group DIDs by method
        const groupedDids: Record<string, Did[]> = {};
        dids.forEach((did: Did) => {
          const method = did.method;
          if (!groupedDids[method]) {
            groupedDids[method] = [];
          }
          groupedDids[method].push(did);
        });
        setDidsByType(groupedDids);
        
        // Pre-select the first DID of the current provider type if available
        const providerDids = dids.filter((did: Did) => did.method === provider);
        if (providerDids.length > 0) {
          setSelectedIssuerId(providerDids[0].did);
        } else {
          setSelectedIssuerId('');
        }
      }
    } catch (err: any) {
      console.error('Error fetching DIDs:', err);
      setError(err.message || 'Failed to fetch DIDs');
    } finally {
      setLoadingDids(false);
    }
  };

  // Filter available DIDs based on the selected provider
  const filteredDids = availableDids.filter(did => did.method === provider);

  const openModal = () => {
    setIsOpen(true);
    fetchAvailableDids();
  };
  
  const closeModal = () => {
    setIsOpen(false);
    setSchemaName('');
    setSchemaVersion('1.0');
    setAttributes(['']);
    setProvider('cheqd');
    setSelectedIssuerId('');
    setError(null);
  };
  
  const openDetailsModal = (schema: Schema) => {
    setSelectedSchema(schema);
    setDetailsModalOpen(true);
  };
  
  const closeDetailsModal = () => {
    setDetailsModalOpen(false);
    setSelectedSchema(null);
  };

  const addAttribute = () => {
    setAttributes([...attributes, '']);
  };

  const removeAttribute = (index: number) => {
    const newAttributes = [...attributes];
    newAttributes.splice(index, 1);
    setAttributes(newAttributes);
  };

  const handleAttributeChange = (index: number, value: string) => {
    const newAttributes = [...attributes];
    newAttributes[index] = value;
    setAttributes(newAttributes);
  };

  // Update selected issuer ID when provider changes
  useEffect(() => {
    const providerDids = availableDids.filter(did => did.method === provider);
    if (providerDids.length > 0) {
      setSelectedIssuerId(providerDids[0].did);
    } else {
      setSelectedIssuerId('');
    }
  }, [provider, availableDids]);

  const handleCreateSchema = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    const filteredAttributes = attributes.filter(attr => attr.trim() !== '');
    if (filteredAttributes.length === 0) {
      setError('At least one attribute is required');
      return;
    }

    if (!selectedIssuerId && filteredDids.length > 0) {
      setError(`A valid ${provider} DID is required. Please select an issuer DID.`);
      return;
    }

    setCreating(true);
    setError(null);

    try {
      console.log('Creating schema with:', {
        name: schemaName,
        version: schemaVersion,
        attributes: filteredAttributes,
        provider,
        issuerId: selectedIssuerId
      });

      // Include the selected issuer ID in the request
      await schemaApi.create(
        schemaName, 
        schemaVersion, 
        filteredAttributes, 
        provider,
        selectedIssuerId 
      );

      const response = await schemaApi.getAll();
      setSchemas(Array.isArray(response) ? response : (response.schemas || []));

      setSchemaName('');
      setSchemaVersion('1.0');
      setAttributes(['']);
      setProvider('cheqd');
      setSelectedIssuerId('');
      
      closeModal();
    } catch (err: any) {
      console.error('Error creating schema:', err);
      setError(err.message || 'Failed to create schema');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex justify-end">
        <button
          onClick={openModal}
          className="btn btn-primary"
        >
          Create Schema
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
          <p className="text-text-secondary">Loading schemas...</p>
        </div>
      ) : schemas.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border-primary">
              <thead className="bg-surface-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Schema ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Version</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Attributes</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Provider</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-primary">
                {schemas.map((schema) => (
                  <tr key={schema.id} className="hover:bg-surface-200 transition-colors duration-200">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary truncate max-w-sm">{schema.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary truncate max-w-sm">{schema.schemaId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-primary font-medium">{schema.schema?.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="badge badge-gray">{schema.schema?.version}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      {schema.schema?.attrNames ? (
                        <div className="flex flex-wrap gap-1">
                          {schema.schema.attrNames.slice(0, 3).map((attr, index) => (
                            <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
                              {attr}
                            </span>
                          ))}
                          {schema.schema.attrNames.length > 3 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-surface-300 text-text-tertiary">
                              +{schema.schema.attrNames.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-text-tertiary italic">No attributes</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`badge ${
                        schema.methodName === 'cheqd' ? 'badge-success' : 'badge-primary'
                      }`}>
                        {schema.methodName}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button 
                        onClick={() => openDetailsModal(schema)}
                        className="text-primary-600 hover:text-primary-700 font-medium transition-colors duration-200"
                      >
                        View Details
                      </button>
                    </td>
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="empty-state-title">No schemas found</h3>
          <p className="empty-state-description">Create your first schema to get started with credential definitions.</p>
          <div className="mt-6">
            <button
              onClick={openModal}
              className="btn btn-primary"
            >
              Create Your First Schema
            </button>
          </div>
        </div>
      )}

      {/* Create Schema Modal */}
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative" style={{ zIndex: 9999 }} onClose={closeModal}>
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
                <Dialog.Panel className="modal-container max-w-md transform overflow-hidden text-left align-middle transition-all">
                  <div className="modal-header">
                    <Dialog.Title as="h3" className="modal-title">
                      Create New Schema
                    </Dialog.Title>
                    <button
                      onClick={closeModal}
                      className="modal-close-button"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="modal-body">
                    <form onSubmit={handleCreateSchema} className="space-y-4">
                    <div>
                      <label className="form-label">
                        Schema Name
                      </label>
                      <input
                        type="text"
                        value={schemaName}
                        onChange={(e) => setSchemaName(e.target.value)}
                        className="form-input"
                        placeholder="Enter schema name"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="form-label">
                        Version
                      </label>
                      <input
                        type="text"
                        value={schemaVersion}
                        onChange={(e) => setSchemaVersion(e.target.value)}
                        className="form-input"
                        required
                        placeholder="1.0"
                      />
                    </div>

                    <div>
                      <label className="form-label">
                        Provider
                      </label>
                      <select
                        value={provider}
                        onChange={(e) => setProvider(e.target.value)}
                        className="form-select"
                        required
                      >
                        <option value="cheqd">Cheqd</option>
                        <option value="kanon">Kanon</option>
                      </select>
                    </div>

                    <div>
                      <label className="form-label">
                        Issuer DID
                      </label>
                      {loadingDids ? (
                        <div className="flex items-center justify-center py-3">
                          <div className="spinner h-5 w-5"></div>
                          <span className="ml-2 text-sm text-text-secondary">Loading DIDs...</span>
                        </div>
                      ) : filteredDids.length > 0 ? (
                        <select
                          value={selectedIssuerId}
                          onChange={(e) => setSelectedIssuerId(e.target.value)}
                          className="form-select"
                          required
                        >
                          {filteredDids.map((did) => (
                            <option key={did.did} value={did.did}>
                              {did.did}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="alert alert-warning">
                          <span>No {provider} DIDs found. Please create a {provider} DID first.</span>
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <label className="form-label">
                        Attributes
                      </label>
                      {attributes.map((attr, index) => (
                        <div key={index} className="flex mb-3 gap-2">
                          <input
                            type="text"
                            value={attr}
                            onChange={(e) => handleAttributeChange(index, e.target.value)}
                            className="form-input flex-1"
                            placeholder="Attribute name"
                            required={index === 0}
                          />
                          {attributes.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeAttribute(index)}
                              className="btn btn-error btn-sm px-3"
                            >
                              -
                            </button>
                          )}
                          {index === attributes.length - 1 && (
                            <button
                              type="button"
                              onClick={addAttribute}
                              className="btn btn-success btn-sm px-3"
                            >
                              +
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-6 flex justify-end space-x-3">
                      <button
                        type="button"
                        onClick={closeModal}
                        className="btn btn-secondary"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={creating}
                      >
                        {creating ? (
                          <>
                            <span className="spinner h-4 w-4 mr-2"></span>
                            Creating...
                          </>
                        ) : (
                          'Create Schema'
                        )}
                      </button>
                    </div>
                    </form>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Schema Details Modal */}
      <Transition appear show={detailsModalOpen} as={Fragment}>
        <Dialog as="div" className="relative" style={{ zIndex: 9999 }} onClose={closeDetailsModal}>
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
                <Dialog.Panel className="modal-container max-w-2xl transform overflow-hidden text-left align-middle transition-all">
                  <div className="modal-header">
                    <Dialog.Title as="h3" className="modal-title">
                      Schema Details
                    </Dialog.Title>
                    <button
                      onClick={closeDetailsModal}
                      className="modal-close-button"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="modal-body">
                  
                  {selectedSchema && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-text-secondary">ID</p>
                          <p className="mt-1 text-sm text-text-primary break-all">{selectedSchema.id}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-secondary">Schema ID</p>
                          <p className="mt-1 text-sm text-text-primary break-all">{selectedSchema.schemaId}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-secondary">Name</p>
                          <p className="mt-1 text-sm text-text-primary font-semibold">{selectedSchema.schema?.name}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-secondary">Version</p>
                          <p className="mt-1">
                            <span className="badge badge-gray">{selectedSchema.schema?.version}</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-secondary">Provider</p>
                          <p className="mt-1">
                            <span className={`badge ${
                              selectedSchema.methodName === 'cheqd' ? 'badge-success' : 'badge-primary'
                            }`}>
                              {selectedSchema.methodName}
                            </span>
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-secondary">Issuer ID</p>
                          <p className="mt-1 text-sm text-text-primary break-all font-mono">{selectedSchema.schema?.issuerId}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-secondary">Created At</p>
                          <p className="mt-1 text-sm text-text-primary">{new Date(selectedSchema.createdAt).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-secondary">Updated At</p>
                          <p className="mt-1 text-sm text-text-primary">{new Date(selectedSchema.updatedAt).toLocaleString()}</p>
                        </div>
                      </div>
                      
                      <div className="mt-6">
                        <p className="text-sm font-medium text-text-secondary mb-3">Attributes</p>
                        <div className="card p-4">
                          {selectedSchema.schema?.attrNames && selectedSchema.schema.attrNames.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {selectedSchema.schema.attrNames.map((attr, index) => (
                                <span key={index} className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
                                  {attr}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-text-tertiary italic">No attributes defined</p>
                          )}
                        </div>
                      </div>
                      
                      {selectedSchema.metadata && Object.keys(selectedSchema.metadata).length > 0 && (
                        <div className="mt-6">
                          <p className="text-sm font-medium text-text-secondary mb-3">Metadata</p>
                          <div className="card p-4 bg-surface-200">
                            <pre className="text-xs text-text-primary overflow-auto max-h-40 font-mono">
                              {JSON.stringify(selectedSchema.metadata, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
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
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
} 