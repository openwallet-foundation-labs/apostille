'use client';

import { useState, useEffect, use } from 'react';
import { groupMessagingApi, connectionApi } from '@/lib/api';
import { toast } from 'react-toastify';
import { useRouter } from 'next/navigation';

export default function GroupChatPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  const router = useRouter();

  const [room, setRoom] = useState<any>(null);
  const [roster, setRoster] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [connections, setConnections] = useState<any[]>([]);
  const [selectedConnection, setSelectedConnection] = useState('');

  useEffect(() => {
    loadData();
    // Poll for new messages every 5 seconds
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [roomId]);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadRoom(),
        loadRoster(),
        loadMessages(),
        loadConnections(),
      ]);
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast.error(`Failed to load group: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadRoom = async () => {
    try {
      const result = await groupMessagingApi.getRoom(roomId);
      setRoom(result.room);
    } catch (error) {
      console.error('Error loading room:', error);
    }
  };

  const loadRoster = async () => {
    try {
      const result = await groupMessagingApi.getRoster(roomId);
      setRoster(result.roster);
    } catch (error) {
      console.error('Error loading roster:', error);
    }
  };

  const loadMessages = async () => {
    try {
      const result = await groupMessagingApi.getMessages(roomId, { limit: 50 });
      setMessages(result.messages || []);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const loadConnections = async () => {
    try {
      const result = await connectionApi.getAll();
      setConnections(result.connections || []);
    } catch (error) {
      console.error('Error loading connections:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.trim()) {
      return;
    }

    try {
      setSending(true);
      await groupMessagingApi.sendMessage(roomId, newMessage);

      // Reload messages to get the persisted message
      await loadMessages();

      setNewMessage('');
      toast.success('Message sent!');
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast.error(`Failed to send message: ${error.message}`);
    } finally {
      setSending(false);
    }
  };

  const [invitationUrl, setInvitationUrl] = useState<string>('');
  const [showInvitationUrl, setShowInvitationUrl] = useState(false);

  const handleInviteMember = async () => {
    if (!selectedConnection) {
      toast.error('Please select a connection to invite');
      return;
    }

    try {
      const connection = connections.find(c => c.id === selectedConnection);
      if (!connection) {
        toast.error('Connection not found');
        return;
      }

      const response = await groupMessagingApi.inviteMember(roomId, {
        inviteeDid: connection.theirDid,
        role: 'member',
      });

      // Create shareable URL
      const baseUrl = window.location.origin;
      const inviteUrl = `${baseUrl}/groups/join?invitation=${response.invitation}`;

      setInvitationUrl(inviteUrl);
      setShowInvitationUrl(true);
      setShowInviteModal(false);
      setSelectedConnection('');

      toast.success('Invitation created! Share the link below.');
    } catch (error: any) {
      console.error('Error inviting member:', error);
      toast.error(`Failed to invite member: ${error.message}`);
    }
  };

  const handleCopyInvitation = () => {
    navigator.clipboard.writeText(invitationUrl);
    toast.success('Invitation link copied to clipboard!');
  };

  const handleLeaveGroup = async () => {
    if (!confirm('Are you sure you want to leave this group?')) {
      return;
    }

    try {
      await groupMessagingApi.leaveRoom(roomId);
      toast.success('Left group successfully');
      router.push('/groups');
    } catch (error: any) {
      console.error('Error leaving group:', error);
      toast.error(`Failed to leave group: ${error.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p className="mt-2 text-text-secondary">Loading group...</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-text-primary">Group not found</h2>
          <button
            onClick={() => router.push('/groups')}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Back to Groups
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="bg-surface-50 dark:bg-surface-900 border-b border-border-secondary px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/groups')}
              className="text-text-tertiary hover:text-text-secondary"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-text-primary">{room.label}</h1>
              <p className="text-sm text-text-tertiary">
                {roster?.members?.filter((m: any) => m.status === 'active').length || 0} members
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={async () => {
                try {
                  await groupMessagingApi.markRoomAsRead(roomId);
                  await loadMessages();
                  toast.success('Marked all as read');
                } catch (error: any) {
                  toast.error(`Failed: ${error.message}`);
                }
              }}
              className="px-3 py-2 text-sm border border-border-secondary text-text-secondary rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
            >
              Mark All Read
            </button>
            <button
              onClick={() => setShowInviteModal(true)}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Invite
            </button>
            <button
              onClick={handleLeaveGroup}
              className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
            >
              Leave
            </button>
          </div>
        </div>
      </div>

      {/* Members Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col">
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 bg-surface-100 dark:bg-surface-800">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-text-tertiary">No messages yet. Start the conversation!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message: any) => (
                  <div key={message.id} className="bg-surface-50 dark:bg-surface-900 rounded-lg p-4 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-text-primary">
                          {message.senderDid?.substring(0, 25)}...
                        </p>
                        <p className="mt-1 text-text-secondary">{message.plaintext}</p>
                        {!message.read && (
                          <span className="inline-block mt-1 px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs rounded">
                            Unread
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-text-tertiary">
                        {new Date(message.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Message Input */}
          <div className="bg-surface-50 dark:bg-surface-900 border-t border-border-secondary p-4">
            <form onSubmit={handleSendMessage} className="flex space-x-3">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 border border-border-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !newMessage.trim()}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </form>
          </div>
        </div>

        {/* Members Sidebar */}
        <div className="w-64 bg-surface-50 dark:bg-surface-900 border-l border-border-secondary p-4 overflow-y-auto">
          <h3 className="font-semibold text-text-primary mb-4">Members</h3>
          {roster?.members?.filter((m: any) => m.status === 'active').length === 0 ? (
            <p className="text-sm text-text-tertiary">No active members</p>
          ) : (
            <div className="space-y-2">
              {roster?.members
                ?.filter((m: any) => m.status === 'active')
                .map((member: any) => (
                  <div key={member.did || member.id || Math.random()} className="flex items-center space-x-2 py-2">
                    <div className="h-8 w-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                      <span className="text-sm font-medium text-primary-600 dark:text-primary-400">
                        {member.did ? member.did.substring(0, 2).toUpperCase() : 'MB'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {member.did ? `${member.did.substring(0, 20)}...` : 'Member'}
                      </p>
                      <p className="text-xs text-text-tertiary">{member.role || 'member'}</p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-surface-50 dark:bg-surface-900 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Invite Member</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Select Connection
                </label>
                <select
                  value={selectedConnection}
                  onChange={(e) => setSelectedConnection(e.target.value)}
                  className="w-full px-3 py-2 border border-border-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Choose a connection...</option>
                  {connections.map((conn) => (
                    <option key={conn.id} value={conn.id}>
                      {conn.theirLabel || conn.theirDid}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleInviteMember}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Invite
              </button>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setSelectedConnection('');
                }}
                className="flex-1 px-4 py-2 border border-border-secondary rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invitation URL Modal */}
      {showInvitationUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-surface-50 dark:bg-surface-900 rounded-lg p-6 w-full max-w-2xl">
            <h2 className="text-xl font-bold mb-4">Share Invitation Link</h2>

            <p className="text-text-secondary mb-4">
              Send this link to the person you want to invite to the group. They can click it or paste it in the "Join Group" page.
            </p>

            <div className="bg-surface-100 dark:bg-surface-800 p-4 rounded-lg mb-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={invitationUrl}
                  readOnly
                  className="flex-1 px-3 py-2 bg-surface-50 dark:bg-surface-900 border border-border-secondary rounded-lg text-sm font-mono"
                />
                <button
                  onClick={handleCopyInvitation}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors whitespace-nowrap"
                >
                  Copy Link
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => {
                  setShowInvitationUrl(false);
                  setInvitationUrl('');
                }}
                className="px-4 py-2 border border-border-secondary rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
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
