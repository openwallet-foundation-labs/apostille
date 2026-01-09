'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';
import { groupMessagingApi, connectionApi } from '@/lib/api';

export default function JoinGroupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invitationInput, setInvitationInput] = React.useState('');
  const [invitationData, setInvitationData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [joining, setJoining] = React.useState(false);
  const [connections, setConnections] = React.useState<any[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = React.useState<string>('');
  const [loadingConnections, setLoadingConnections] = React.useState(false);

  // Check for invitation in URL params on mount
  React.useEffect(() => {
    const invitationParam = searchParams.get('invitation');
    if (invitationParam) {
      setInvitationInput(invitationParam);
      handleParseInvitation(invitationParam);
    }
  }, [searchParams]);

  const fetchConnections = async () => {
    setLoadingConnections(true);
    try {
      const response = await connectionApi.getAll();
      if (response.success) {
        // Filter to only show completed connections
        const activeConnections = response.connections.filter(
          (conn: any) => conn.state === 'completed'
        );
        setConnections(activeConnections);

        // Auto-select first connection if only one available
        if (activeConnections.length === 1) {
          setSelectedConnectionId(activeConnections[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching connections:', error);
      toast.error('Failed to load connections');
    } finally {
      setLoadingConnections(false);
    }
  };

  const handleParseInvitation = async (input: string) => {
    try {
      // Extract invitation code from URL if it's a full URL
      let invitationCode = input;
      if (input.includes('invitation=')) {
        const url = new URL(input);
        invitationCode = url.searchParams.get('invitation') || input;
      }

      // Decode base64 invitation
      const decoded = Buffer.from(invitationCode, 'base64').toString('utf-8');
      const data = JSON.parse(decoded);

      setInvitationData(data);
      toast.success('Invitation loaded successfully!');

      // Fetch available connections after loading invitation
      await fetchConnections();
    } catch (error) {
      console.error('Error parsing invitation:', error);
      toast.error('Invalid invitation format');
      setInvitationData(null);
    }
  };

  const handleLoadInvitation = () => {
    if (!invitationInput.trim()) {
      toast.error('Please enter an invitation link or code');
      return;
    }
    handleParseInvitation(invitationInput);
  };

  const handleAcceptInvitation = async () => {
    if (!invitationData) {
      toast.error('No invitation loaded');
      return;
    }

    if (!selectedConnectionId) {
      toast.error('Please select a connection to use for joining');
      return;
    }

    setJoining(true);
    try {
      await groupMessagingApi.joinRoom({
        roomDid: invitationData.roomDid,
        joinToken: invitationData.joinToken,
        connectionId: selectedConnectionId,
      });

      toast.success('Successfully joined the group!');
      router.push('/groups');
    } catch (error: any) {
      console.error('Error joining group:', error);
      toast.error(`Failed to join group: ${error.message}`);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="card p-6">
        {/* Invitation Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Invitation Link or Code
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={invitationInput}
              onChange={(e) => setInvitationInput(e.target.value)}
              placeholder="Paste invitation link or code here..."
              className="flex-1 px-4 py-2 border border-border-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              onClick={handleLoadInvitation}
              disabled={loading}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              Load
            </button>
          </div>
          <p className="mt-2 text-sm text-text-tertiary">
            Paste the invitation link you received from a group admin
          </p>
        </div>

        {/* Invitation Details */}
        {invitationData && (
          <div className="border border-border-secondary rounded-lg p-6 mb-6 bg-surface-100 dark:bg-surface-800">
            <h2 className="text-lg font-semibold mb-4">Invitation Details</h2>

            <div className="space-y-3">
              <div>
                <span className="text-sm font-medium text-text-secondary">Group Name:</span>
                <p className="text-base font-semibold">{invitationData.roomLabel || 'Unnamed Group'}</p>
              </div>

              <div>
                <span className="text-sm font-medium text-text-secondary">Room DID:</span>
                <p className="text-xs font-mono text-text-tertiary break-all">{invitationData.roomDid}</p>
              </div>

              <div>
                <span className="text-sm font-medium text-text-secondary">Invited by:</span>
                <p className="text-xs font-mono text-text-tertiary break-all">
                  {invitationData.inviter?.substring(0, 40)}...
                </p>
              </div>

              <div>
                <span className="text-sm font-medium text-text-secondary">Token Expiry:</span>
                <p className="text-sm text-text-secondary">
                  {new Date(invitationData.joinToken.token.exp).toLocaleString()}
                </p>
              </div>

              <div>
                <span className="text-sm font-medium text-text-secondary block mb-2">Select Connection:</span>
                {loadingConnections ? (
                  <p className="text-sm text-text-tertiary">Loading connections...</p>
                ) : connections.length === 0 ? (
                  <p className="text-sm text-red-500">No active connections found. Please establish a connection first.</p>
                ) : (
                  <select
                    value={selectedConnectionId}
                    onChange={(e) => setSelectedConnectionId(e.target.value)}
                    className="w-full px-3 py-2 border border-border-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">-- Select a connection --</option>
                    {connections.map((conn) => (
                      <option key={conn.id} value={conn.id}>
                        {conn.theirLabel || conn.theirDid?.substring(0, 20) + '...' || `Connection ${conn.id.substring(0, 8)}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={handleAcceptInvitation}
                disabled={joining || !selectedConnectionId || loadingConnections}
                className="w-full px-4 py-3 bg-success-600 text-white font-semibold rounded-lg hover:bg-success-700 transition-colors disabled:opacity-50"
              >
                {joining ? 'Joining...' : 'Accept Invitation & Join Group'}
              </button>
            </div>
          </div>
        )}

        {!invitationData && (
          <div className="text-center py-12 text-text-tertiary">
            <svg className="mx-auto h-12 w-12 text-text-tertiary mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p>No invitation loaded yet</p>
            <p className="text-sm mt-2">Paste an invitation link above to get started</p>
          </div>
        )}

        <div className="mt-6">
          <button
            onClick={() => router.push('/groups')}
            className="w-full px-4 py-2 border border-border-secondary rounded-lg hover:bg-surface-100 dark:bg-surface-800 transition-colors"
          >
            Back to Groups
          </button>
        </div>
      </div>
    </div>
  );
}
