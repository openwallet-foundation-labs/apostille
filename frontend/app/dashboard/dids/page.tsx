'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { didApi } from '../../../lib/api';
import { Icon } from '../../components/ui/Icons';

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
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createSuccess, setCreateSuccess] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');

  const availableMethods = [
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

  const openCreateModal = () => { setShowCreateModal(true); setSelectedMethod(''); setCreateSuccess(false); setError(null); };
  const closeCreateModal = () => { setShowCreateModal(false); setSelectedMethod(''); setIsCreating(false); setCreateSuccess(false); setError(null); };

  const handleCreateDID = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMethod) { setError('Please select a DID method'); return; }
    setIsCreating(true); setError(null);
    try {
      const response = await didApi.create(selectedMethod);
      if (response.success) {
        setCreateSuccess(true);
        const updatedResponse = await didApi.getAll();
        setDids(updatedResponse.dids || []);
        setTimeout(() => closeCreateModal(), 2000);
      } else {
        setError(response.message || 'Failed to create DID');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create DID');
    } finally {
      setIsCreating(false);
    }
  };

  // Compute method counts
  const methodCounts: Record<string, number> = {};
  dids.forEach(d => {
    const m = d.did.split(':')[1] || d.method || 'unknown';
    methodCounts[m] = (methodCounts[m] || 0) + 1;
  });

  const methodCards = [
    { method: 'web', label: 'did:web', count: methodCounts['web'] || 0 },
    { method: 'kanon', label: 'did:kanon', count: methodCounts['kanon'] || 0 },
    { method: 'key', label: 'did:key', count: methodCounts['key'] || 0 },
  ];

  const filteredDids = dids.filter(d =>
    !searchQuery || d.did.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">DIDs</h1>
          <p className="page-sub">Decentralized identifiers and resolution status.</p>
        </div>
        <button onClick={openCreateModal} className="btn btn-primary">
          <Icon name="plus" size={14} /> Create DID
        </button>
      </div>

      {error && !showCreateModal && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}><span>{error}</span></div>
      )}

      {/* Method stat cards */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        {methodCards.map((mc) => (
          <div key={mc.method} className="card card-pad" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="fingerprint" size={16} style={{ color: 'var(--accent)' }} />
              <div style={{ flex: 1 }}>
                <div className="mono" style={{ fontSize: 12, color: 'var(--ink-2)' }}>{mc.label}</div>
                <div className="mono-dim" style={{ fontSize: 11 }}>method</div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
                {mc.count}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="empty"><div className="spinner" style={{ width: 32, height: 32 }} /></div>
      ) : dids.length > 0 ? (
        <div className="table-wrap">
          <div className="table-toolbar">
            <div className="search" style={{ flex: 1, maxWidth: 280, position: 'relative' }}>
              <Icon name="search" size={13} className="absolute left-[10px] top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-4)' }} />
              <input
                placeholder="Search DIDs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', height: 30, padding: '0 12px 0 30px',
                  background: 'var(--bg-sunk)', border: '1px solid transparent',
                  borderRadius: 6, fontSize: '12.5px', outline: 'none', color: 'var(--ink)',
                }}
              />
            </div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>DID</th>
                <th>Method</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDids.map((did) => {
                const method = did.did.split(':')[1] || did.method;
                return (
                  <tr key={did.did}>
                    <td>
                      <span className="mono" style={{ fontSize: 12 }}>
                        {did.did.length > 54 ? did.did.slice(0, 54) + '...' : did.did}
                      </span>
                    </td>
                    <td><span className="tag">{method}</span></td>
                    <td>
                      <span className={`badge ${did.state === 'finished' || !did.state ? 'green' : 'amber'}`}>
                        <span className="badge-dot" />
                        {did.state === 'finished' || !did.state ? 'active' : did.state}
                      </span>
                    </td>
                    <td><span className="mono-dim">{new Date(did.createdAt).toLocaleDateString()}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-actions" style={{ opacity: 1, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-xs">Resolve</button>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigator.clipboard.writeText(did.did)}>
                          <Icon name="copy" size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <div className="empty-icon"><Icon name="fingerprint" size={22} /></div>
          <div className="empty-title">No DIDs found</div>
          <div className="empty-desc">Create your first decentralized identifier to get started.</div>
          <div className="empty-actions">
            <button onClick={openCreateModal} className="btn btn-primary">Create DID</button>
          </div>
        </div>
      )}

      {/* Create DID Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-container max-w-md">
            <div className="modal-header">
              <h2 className="modal-title">Create New DID</h2>
              <button onClick={closeCreateModal} className="modal-close-button">
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="modal-body">
              {createSuccess ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%', margin: '0 auto 16px',
                    background: 'var(--green-soft)', display: 'grid', placeItems: 'center',
                  }}>
                    <Icon name="check" size={24} style={{ color: 'var(--green)' }} />
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>DID Created Successfully!</h3>
                  <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Your new decentralized identifier has been created.</p>
                </div>
              ) : (
                <form onSubmit={handleCreateDID}>
                  <div style={{ marginBottom: 16 }}>
                    <label className="field-label" style={{ marginBottom: 12, display: 'block' }}>Select DID Method</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {availableMethods.map((method) => (
                        <label key={method.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                          <input
                            type="radio" name="didMethod" value={method.value}
                            checked={selectedMethod === method.value}
                            onChange={(e) => setSelectedMethod(e.target.value)}
                            style={{ marginTop: 3, accentColor: 'var(--accent)' }}
                          />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{method.label}</div>
                            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{method.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  {error && <div className="alert alert-error" style={{ marginBottom: 16 }}><span>{error}</span></div>}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 16 }}>
                    <button type="button" onClick={closeCreateModal} className="btn btn-secondary">Cancel</button>
                    <button type="submit" disabled={isCreating || !selectedMethod} className="btn btn-primary">
                      {isCreating ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Creating...</> : 'Create DID'}
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
