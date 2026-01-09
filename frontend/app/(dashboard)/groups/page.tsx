'use client';

import { useState, useEffect } from 'react';
import { groupMessagingApi } from '@/lib/api';
import { toast } from 'react-toastify';
import { useRouter } from 'next/navigation';

export default function GroupsPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create room form state
  const [label, setLabel] = useState('');
  const [maxMembers, setMaxMembers] = useState(100);
  const [joinPolicy, setJoinPolicy] = useState('invite-only');

  useEffect(() => {
    loadRooms();
  }, []);

  const loadRooms = async () => {
    try {
      setLoading(true);
      const result = await groupMessagingApi.getRooms();
      setRooms(result.rooms || []);
    } catch (error: any) {
      console.error('Error loading rooms:', error);
      toast.error(`Failed to load rooms: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = async () => {
    try {
      if (!label.trim()) {
        toast.error('Please enter a group name');
        return;
      }

      const result = await groupMessagingApi.createRoom({
        label,
        policy: {
          join: joinPolicy,
          maxMembers,
          adminThreshold: 1,
        },
      });

      toast.success('Group created successfully!');
      setShowCreateModal(false);
      setLabel('');
      setMaxMembers(100);
      setJoinPolicy('invite-only');
      await loadRooms();
    } catch (error: any) {
      console.error('Error creating room:', error);
      toast.error(`Failed to create group: ${error.message}`);
    }
  };

  const handleOpenRoom = (roomId: string) => {
    router.push(`/groups/${roomId}`);
  };

  const handleArchiveRoom = async (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the room

    if (!confirm('Are you sure you want to archive this group?')) {
      return;
    }

    try {
      await groupMessagingApi.archiveRoom(roomId);
      toast.success('Group archived successfully');
      await loadRooms();
    } catch (error: any) {
      console.error('Error archiving room:', error);
      toast.error(`Failed to archive group: ${error.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex justify-end gap-3">
        <button
          onClick={() => router.push('/groups/join')}
          className="btn btn-secondary flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Join Group
        </button>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary"
        >
          Create Group
        </button>
      </div>

      {/* Groups List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p className="mt-2 text-text-secondary">Loading groups...</p>
        </div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-12 bg-surface-100 rounded-lg">
          <svg
            className="mx-auto h-12 w-12 text-text-tertiary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-text-primary">No groups</h3>
          <p className="mt-1 text-sm text-text-tertiary">
            Get started by creating a new group.
          </p>
          <div className="mt-6">
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary"
            >
              Create Group
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room) => (
            <div
              key={room.id}
              onClick={() => handleOpenRoom(room.id)}
              className="card card-hover cursor-pointer p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-text-primary">
                    {room.label}
                  </h3>
                  <div className="flex items-center space-x-2 mt-1">
                    <p className="text-sm text-text-tertiary truncate">
                      {room.did?.substring(0, 30)}...
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(room.did || '');
                        toast.success('Group ID copied to clipboard!');
                      }}
                      className="text-text-tertiary hover:text-primary-600 transition-colors flex-shrink-0"
                      title="Copy Group ID to share with others"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <button
                  onClick={(e) => handleArchiveRoom(room.id, e)}
                  className="text-text-tertiary hover:text-error-600 transition-colors"
                  title="Archive group"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm">
                <div className="flex items-center space-x-4">
                  <span className="text-text-secondary">
                    <span className="font-medium">{room.policy?.maxMembers || 100}</span> max members
                  </span>
                  <span className={`badge ${
                    room.status === 'active' ? 'badge-success' : 'badge-gray'
                  }`}>
                    {room.status || 'active'}
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-border-secondary">
                <p className="text-xs text-text-tertiary">
                  {room.policy?.join === 'invite-only' ? '🔒 Invite Only' : '🌐 Open'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-container max-w-md">
            <h2 className="text-xl font-bold mb-4 text-text-primary">Create New Group</h2>

            <div className="space-y-4">
              <div>
                <label className="form-label">
                  Group Name
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="input w-full"
                  placeholder="Enter group name"
                />
              </div>

              <div>
                <label className="form-label">
                  Join Policy
                </label>
                <select
                  value={joinPolicy}
                  onChange={(e) => setJoinPolicy(e.target.value)}
                  className="input w-full"
                >
                  <option value="invite-only">Invite Only</option>
                  <option value="open">Open</option>
                  <option value="approval-required">Approval Required</option>
                </select>
              </div>

              <div>
                <label className="form-label">
                  Max Members
                </label>
                <input
                  type="number"
                  value={maxMembers}
                  onChange={(e) => setMaxMembers(parseInt(e.target.value))}
                  className="input w-full"
                  min="2"
                  max="1000"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreateRoom}
                className="btn btn-primary flex-1"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setLabel('');
                  setMaxMembers(100);
                  setJoinPolicy('invite-only');
                }}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
