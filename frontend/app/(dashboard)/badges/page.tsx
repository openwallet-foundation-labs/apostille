'use client';

import React, { useState, useEffect } from 'react';
import { openbadgesApi, connectionApi, type OpenBadgeCredential } from '@/lib/api';
import { BadgeCard, BadgeDetailsModal, IssueBadgeModal, VerifyBadgeModal } from '@/app/components/openbadges';

interface Connection {
  id: string;
  state: string;
  theirLabel?: string;
}

export default function BadgesPage() {
  const [badges, setBadges] = useState<OpenBadgeCredential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<OpenBadgeCredential | null>(null);

  // Profile state
  const [profile, setProfile] = useState<{ id: string; name: string } | null>(null);

  // Connections state for sending badges via DIDComm
  const [connections, setConnections] = useState<Connection[]>([]);

  const fetchBadges = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await openbadgesApi.getAll();
      setBadges(response.credentials || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch badges');
      setBadges([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const response = await openbadgesApi.getProfile();
      setProfile(response.profile);
    } catch {
      // Profile fetch failed, not critical
    }
  };

  const fetchConnections = async () => {
    try {
      const response = await connectionApi.getAll();
      // Filter to completed connections only
      const completedConnections = (response.connections || []).filter(
        (c: Connection) => c.state === 'completed' || c.state === 'complete'
      );
      setConnections(completedConnections);
    } catch {
      // Connection fetch failed, not critical
    }
  };

  useEffect(() => {
    fetchBadges();
    fetchProfile();
    fetchConnections();
  }, []);

  const handleBadgeClick = (badge: OpenBadgeCredential) => {
    setSelectedBadge(badge);
  };

  const handleIssueSuccess = () => {
    fetchBadges();
  };

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex justify-end gap-3">
        <button
          onClick={() => setIsVerifyModalOpen(true)}
          className="btn btn-secondary flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Verify Badge
        </button>
        <button
          onClick={() => setIsIssueModalOpen(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Issue Badge
        </button>
      </div>

      {/* Issuer Profile Card */}
      {profile && (
        <div className="p-4 bg-surface-100 rounded-lg border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-text-primary">{profile.name}</p>
              <p className="text-xs text-text-tertiary font-mono">{profile.id}</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{badges.length}</p>
              <p className="text-sm text-text-secondary">Total Badges</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">
                {badges.filter(b => b.proof).length}
              </p>
              <p className="text-sm text-text-secondary">Verified</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
              <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">
                {badges.length > 0
                  ? new Date(badges[0].validFrom).toLocaleDateString()
                  : '-'}
              </p>
              <p className="text-sm text-text-secondary">Last Issued</p>
            </div>
          </div>
        </div>
      </div>

      {/* Badge Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="spinner w-8 h-8" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-error/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-error font-medium">{error}</p>
          <button onClick={fetchBadges} className="btn btn-secondary mt-4">
            Try Again
          </button>
        </div>
      ) : badges.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-surface-100 flex items-center justify-center">
            <svg className="w-10 h-10 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-text-primary">No badges yet</h3>
          <p className="text-text-secondary mt-1">
            Issue your first OpenBadge credential to get started.
          </p>
          <button
            onClick={() => setIsIssueModalOpen(true)}
            className="btn btn-primary mt-4"
          >
            Issue First Badge
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {badges.map((badge, index) => (
            <BadgeCard
              key={badge.id || index}
              badge={badge}
              onClick={() => handleBadgeClick(badge)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <IssueBadgeModal
        isOpen={isIssueModalOpen}
        onClose={() => setIsIssueModalOpen(false)}
        onSuccess={handleIssueSuccess}
        connections={connections}
      />

      <VerifyBadgeModal
        isOpen={isVerifyModalOpen}
        onClose={() => setIsVerifyModalOpen(false)}
      />

      <BadgeDetailsModal
        isOpen={!!selectedBadge}
        onClose={() => setSelectedBadge(null)}
        badge={selectedBadge}
      />
    </div>
  );
}
