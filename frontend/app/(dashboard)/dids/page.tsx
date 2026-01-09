'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { didApi } from '../../../lib/api';

interface DID {
  did: string;
  method: string;
  createdAt: string;
  state?: string;
  role?: string;
}

export default function DIDsPage() {
  const { tenantId } = useAuth();
  const [dids, setDids] = useState<DID[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Create DID modal states
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createSuccess, setCreateSuccess] = useState<boolean>(false);

  const availableMethods = [
    // { value: 'cheqd', label: 'Cheqd', description: 'Decentralized identity on Cheqd network' },
    { value: 'kanon', label: 'Kanon', description: 'Kanon DID method' },
    { value: 'key', label: 'Key', description: 'Simple key-based DID method' },
  ];

  useEffect(() => {
    const fetchDids = async () => {
      if (!tenantId) return;
      
      setLoading(true);
      try {
        const response = await didApi.getAll();
        setDids(response.dids || []);
        setError(null);
      } catch (err: any) {
        console.error('Error fetching DIDs:', err);
        setError(err.message || 'Failed to fetch DIDs');
      } finally {
        setLoading(false);
      }
    };

    fetchDids();
  }, [tenantId]);

  const openCreateModal = () => {
    setShowCreateModal(true);
    setSelectedMethod('');
    setCreateSuccess(false);
    setError(null);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setSelectedMethod('');
    setIsCreating(false);
    setCreateSuccess(false);
    setError(null);
  };

  const handleCreateDID = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedMethod) {
      setError('Please select a DID method');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const response = await didApi.create(selectedMethod);
      
      if (response.success) {
        setCreateSuccess(true);
        // Refresh the DIDs list
        const updatedResponse = await didApi.getAll();
        setDids(updatedResponse.dids || []);
        
        // Close modal after a short delay
        setTimeout(() => {
          closeCreateModal();
        }, 2000);
      } else {
        setError(response.message || 'Failed to create DID');
      }
    } catch (err: any) {
      console.error('Error creating DID:', err);
      setError(err.message || 'Failed to create DID');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex justify-end">
        <button
          onClick={openCreateModal}
          className="btn btn-primary"
        >
          Create DID
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
          <p className="text-text-secondary">Loading DIDs...</p>
        </div>
      ) : dids.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border-primary">
              <thead className="bg-surface-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">DID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Method</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">State</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-primary">
                {dids.map((did) => (
                  <tr key={did.did} className="hover:bg-surface-200 transition-colors duration-200">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-primary font-mono break-all max-w-xs">{did.did}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`badge ${
                        did.method === 'cheqd' ? 'badge-success' : 
                        did.method === 'kanon' ? 'badge-primary' : 'badge-gray'
                      }`}>
                        {did.method}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="badge badge-success">{did.state || 'Active'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                      {new Date(did.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button className="text-primary-600 hover:text-primary-700 font-medium transition-colors duration-200">
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h3 className="empty-state-title">No DIDs found</h3>
          <p className="empty-state-description">Create your first decentralized identifier to get started.</p>
          <div className="mt-6">
            <button 
              onClick={openCreateModal}
              className="btn btn-primary"
            >
              Create Your First DID
            </button>
          </div>
        </div>
      )}

      {/* Create DID Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center" style={{ zIndex: 9999 }}>
          <div className="modal-container max-w-md">
            <div className="modal-header">
              <h2 className="modal-title">Create New DID</h2>
              <button
                onClick={closeCreateModal}
                className="modal-close-button"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="modal-body">
              {createSuccess ? (
                <div className="text-center">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-success-100 mb-4">
                    <svg className="h-6 w-6 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-text-primary mb-2">DID Created Successfully!</h3>
                  <p className="text-text-secondary">Your new decentralized identifier has been created.</p>
                </div>
              ) : (
                <form onSubmit={handleCreateDID} className="space-y-4">
                  <div>
                    <label className="form-label">
                      Select DID Method
                    </label>
                    <div className="space-y-3">
                      {availableMethods.map((method) => (
                        <label key={method.value} className="flex items-start space-x-3 cursor-pointer">
                          <input
                            type="radio"
                            name="didMethod"
                            value={method.value}
                            checked={selectedMethod === method.value}
                            onChange={(e) => setSelectedMethod(e.target.value)}
                            className="form-radio h-4 w-4 text-primary-600 focus:ring-primary-500 border-border-primary mt-1"
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-text-primary">{method.label}</div>
                            <div className="text-sm text-text-secondary">{method.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {error && (
                    <div className="alert alert-error">
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={closeCreateModal}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreating || !selectedMethod}
                      className="btn btn-primary"
                    >
                      {isCreating ? (
                        <>
                          <div className="spinner h-4 w-4 mr-2"></div>
                          Creating...
                        </>
                      ) : (
                        'Create DID'
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 