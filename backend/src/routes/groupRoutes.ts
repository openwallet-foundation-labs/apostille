import { Router } from 'express';
import { getAgent } from '../services/agentService';
import { Buffer } from 'buffer';

const router = Router();

/**
 * Helper function to get the primary DID for a tenant
 * Prefers did:key for signing operations, falls back to first available DID
 */
async function getPrimaryDid(tenantId: string): Promise<string> {
  const agent = await getAgent({ tenantId });
  const dids = await agent.dids.getCreatedDids({});

  if (!dids || dids.length === 0) {
    throw new Error('No DID found for this tenant. Please create a DID first.');
  }

  // Look for a did:key (required for signing operations)
  const didKey = dids.find((d) => d.did.startsWith('did:key:'));
  if (didKey) {
    return didKey.did;
  }

  // If no did:key exists, create one
  console.log(`[getPrimaryDid] No did:key found for tenant ${tenantId}, creating one...`);
  const result = await agent.dids.create({
    method: 'key',
    options: {
      keyType: 'ed25519',
    },
  });

  if (result.didState.state !== 'finished' || !result.didState.did) {
    throw new Error('Failed to create did:key for signing operations');
  }

  console.log(`[getPrimaryDid] Created did:key: ${result.didState.did}`);
  return result.didState.did;
}

/**
 * POST /api/groups/rooms
 * Create a new group messaging room
 */
router.post('/rooms', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const agent = await getAgent({ tenantId });

    // Get the primary DID for this tenant
    const did = await getPrimaryDid(tenantId);

    const {
      label,
      policy,
      ciphersuite
    } = req.body;

    // Create room DID (could be a peer DID)
    const roomDid = `did:peer:room-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    console.log('[Create Room Debug]', {
      ownerDid: did,
      tenantId,
      roomDid
    });

    const room = await agent.modules.groupMessaging.createRoom({
      roomDid,
      label: label || 'New Group',
      ownerDid: did,
      policy: {
        join: policy?.join || 'invite-only',
        maxMembers: policy?.maxMembers || 100,
        adminThreshold: policy?.adminThreshold || 1,
        ...policy
      },
      ciphersuite: ciphersuite || 'MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'
    });

    console.log('[Create Room Success]', {
      roomId: room.id,
      owner: room.owner,
      admins: room.admins
    });

    res.json({
      success: true,
      room
    });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/groups/rooms
 * Get all active rooms for the current tenant
 */
router.get('/rooms', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const agent = await getAgent({ tenantId });

    const rooms = await agent.modules.groupMessaging.getActiveRooms();

    res.json({
      success: true,
      rooms
    });
  } catch (error) {
    console.error('Error getting rooms:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/groups/rooms/:roomId
 * Get room details
 */
router.get('/rooms/:roomId', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const agent = await getAgent({ tenantId });
    const { roomId } = req.params;

    const room = await agent.modules.groupMessaging.getRoom(roomId);

    res.json({
      success: true,
      room
    });
  } catch (error) {
    console.error('Error getting room:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/groups/rooms/:roomId/roster
 * Get room roster (member list)
 */
router.get('/rooms/:roomId/roster', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const agent = await getAgent({ tenantId });
    const { roomId } = req.params;

    const roster = await agent.modules.groupMessaging.getRoster(roomId);

    res.json({
      success: true,
      roster
    });
  } catch (error) {
    console.error('Error getting roster:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/groups/rooms/:roomId/invite
 * Invite a member to a room
 */
router.post('/rooms/:roomId/invite', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const agent = await getAgent({ tenantId });
    const { roomId } = req.params;
    const { inviteeDid, devicePublicKey, role } = req.body;

    // Get the primary DID for this tenant
    const did = await getPrimaryDid(tenantId);

    // Get room details
    const room = await agent.modules.groupMessaging.getRoom(roomId);

    // Debug logging
    console.log('[Invite Member Debug]', {
      currentUserDid: did,
      roomOwner: room.owner,
      roomAdmins: room.admins,
      isAdmin: room.admins.includes(did),
      tenantId
    });

    // Verify the current user is an admin
    if (!room.admins.includes(did)) {
      // Check if this is a legacy room (created with did:peer before did:key support)
      const isLegacyRoom = room.owner.startsWith('did:peer:');

      console.error('[Invite Member] User not in admins list', {
        userDid: did,
        admins: room.admins,
        isLegacyRoom
      });

      if (isLegacyRoom) {
        return res.status(403).json({
          success: false,
          message: 'This room was created with an old DID type. Please delete it and create a new one to enable invitations.'
        });
      }

      return res.status(403).json({
        success: false,
        message: 'Only admins can invite members'
      });
    }

    // Get or generate device key for invitee
    let publicKey: Uint8Array;
    if (devicePublicKey) {
      publicKey = Buffer.from(devicePublicKey, 'base64');
    } else {
      // Check if device key already exists
      const hasKey = await agent.modules.groupMessaging.hasDeviceKey(inviteeDid);

      if (hasKey) {
        // Use existing device key
        console.log(`[Invite Member] Using existing device key for ${inviteeDid}`);
        publicKey = await agent.modules.groupMessaging.getDevicePublicKey(inviteeDid);
      } else {
        // Generate a new device key
        console.log(`[Invite Member] Generating new device key for ${inviteeDid}`);
        const deviceKey = await agent.modules.groupMessaging.generateDeviceKey(inviteeDid);
        publicKey = deviceKey.publicKey;
      }
    }

    // Create authorization artifact (using signing module 0.1.5)
    // Note: adminDids should only include DIDs whose private keys are in the current agent's wallet
    // In this case, only the current user (inviter) can sign
    const authz = await agent.modules.signing.createAuthzArtifact({
      action: 'invite',
      roomDid: room.did,
      targetDid: inviteeDid,
      adminDids: [did], // Only current user - they're the one signing
      threshold: 1, // Single signature from the inviter
      payload: {
        room: room.did,
        invitee: inviteeDid,
        role: role || 'member'
      }
    });

    // Create join token (admin is the room owner/host in this case)
    const joinToken = await agent.modules.groupMessaging.inviteMember({
      roomId,
      inviteeDid,
      inviterDid: did,
      devicePublicKey: publicKey,
      authz,
      role
    });

    console.log(`[Invite Member] Join token created for ${inviteeDid}`);

    // Create shareable invitation data
    const invitationData = {
      roomDid: room.did,
      roomLabel: room.label,
      inviter: did,
      joinToken: joinToken,
    };

    // Encode as base64 for easy sharing
    const invitationString = Buffer.from(JSON.stringify(invitationData)).toString('base64');

    res.json({
      success: true,
      invitation: invitationString,
      invitationData, // Also return raw data for display
      message: 'Invitation created successfully. Share the invitation link with the invitee.'
    });
  } catch (error) {
    console.error('Error inviting member:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/groups/rooms/join
 * Join a room with a join token
 */
router.post('/rooms/join', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const agent = await getAgent({ tenantId });
    const {
      roomDid,
      joinToken,
      connectionId,
    } = req.body;

    // Validate that connectionId is provided
    if (!connectionId) {
      return res.status(400).json({
        success: false,
        message: 'Connection ID is required. Please select a connection to use for joining.'
      });
    }

    // Get the primary DID for this tenant
    const did = await getPrimaryDid(tenantId);

    // Validate that the connection exists and is active
    const connection = await agent.connections.getById(connectionId);

    if (!connection) {
      return res.status(400).json({
        success: false,
        message: 'Connection not found. Please select a valid connection.'
      });
    }

    if (connection.state !== 'completed') {
      return res.status(400).json({
        success: false,
        message: `Connection is not active (current state: ${connection.state}). Please use an active connection.`
      });
    }

    console.log(`[Join Room] Using connection ${connection.id} (${connection.theirLabel || connection.theirDid})`);

    // Generate key package for joining using MLS service directly
    const { MLSService } = await import('@ajna-inc/group-messaging');
    const mlsService = agent.context.dependencyManager.resolve(MLSService);

    const keyPackage = await mlsService.generateKeyPackage(agent.context, {
      clientId: did,
      ciphersuite: 'MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519',
    });

    console.log(`[Join Room] Generated key package for ${did}`);

    // Join room (internally verifies join token using signing module)
    await agent.modules.groupMessaging.joinRoom({
      roomDid,
      joinerDid: did,
      joinToken,
      keyPackage,
      connectionId: connection.id
    });

    res.json({
      success: true,
      message: 'Successfully joined room'
    });
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/groups/rooms/:roomId/messages
 * Get messages for a room (with pagination)
 */
router.get('/rooms/:roomId/messages', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const agent = await getAgent({ tenantId });
    const { roomId } = req.params;
    const { limit, skip } = req.query;

    const messages = await agent.modules.groupMessaging.getMessagesPaginated({
      roomId,
      limit: limit ? parseInt(limit as string) : 50,
      skip: skip ? parseInt(skip as string) : 0,
    });

    // Convert MessageRecord to plain objects
    const plainMessages = messages.map((msg: any) => ({
      id: msg.id,
      roomId: msg.roomId,
      roomDid: msg.roomDid,
      mlsMsgId: msg.mlsMsgId,
      senderDid: msg.senderDid,
      plaintext: msg.plaintext,
      epoch: msg.epoch,
      threadId: msg.threadId,
      read: msg.read,
      deliveryReceipts: msg.deliveryReceipts,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
    }));

    res.json({
      success: true,
      messages: plainMessages,
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/groups/rooms/:roomId/messages
 * Send a message to a room
 */
router.post('/rooms/:roomId/messages', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const agent = await getAgent({ tenantId });
    const { roomId } = req.params;
    const { message } = req.body;

    // Get the primary DID for this tenant
    const did = await getPrimaryDid(tenantId);

    const messageId = await agent.modules.groupMessaging.sendMessage(
      roomId,
      message,
      did
    );

    res.json({
      success: true,
      messageId,
      message: 'Message sent successfully'
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/groups/rooms/:roomId/messages/:messageId/status
 * Get delivery receipt status for a message
 */
router.get('/rooms/:roomId/messages/:messageId/status', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const agent = await getAgent({ tenantId });
    const { roomId, messageId } = req.params;

    const status = await agent.modules.groupMessaging.getReceiptStatus(roomId, messageId);

    res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error('Error getting message status:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/groups/rooms/:roomId/messages/unread
 * Get unread messages for a room
 */
router.get('/rooms/:roomId/messages/unread', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const agent = await getAgent({ tenantId });
    const { roomId } = req.params;

    const messages = await agent.modules.groupMessaging.getUnreadMessages({ roomId });

    const plainMessages = messages.map((msg: any) => ({
      id: msg.id,
      roomId: msg.roomId,
      senderDid: msg.senderDid,
      plaintext: msg.plaintext,
      createdAt: msg.createdAt,
    }));

    res.json({
      success: true,
      messages: plainMessages,
    });
  } catch (error) {
    console.error('Error getting unread messages:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * PUT /api/groups/rooms/:roomId/messages/:messageId/read
 * Mark a message as read
 */
router.put('/rooms/:roomId/messages/:messageId/read', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const agent = await getAgent({ tenantId });
    const { messageId } = req.params;

    await agent.modules.groupMessaging.markMessageAsRead({ messageId });

    res.json({
      success: true,
      message: 'Message marked as read'
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * PUT /api/groups/rooms/:roomId/read
 * Mark all messages in a room as read
 */
router.put('/rooms/:roomId/read', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const agent = await getAgent({ tenantId });
    const { roomId } = req.params;

    await agent.modules.groupMessaging.markRoomAsRead({ roomId });

    res.json({
      success: true,
      message: 'All messages marked as read'
    });
  } catch (error) {
    console.error('Error marking room as read:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/groups/rooms/:roomId/leave
 * Leave a room
 */
router.post('/rooms/:roomId/leave', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const agent = await getAgent({ tenantId });
    const { roomId } = req.params;

    // Get the primary DID for this tenant
    const did = await getPrimaryDid(tenantId);

    await agent.modules.groupMessaging.removeMember({
      roomId,
      moderatorDid: did,
      memberDid: did,
      reason: 'User left the room'
    });

    res.json({
      success: true,
      message: 'Successfully left room'
    });
  } catch (error) {
    console.error('Error leaving room:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * DELETE /api/groups/rooms/:roomId
 * Delete/Archive a room (owner only)
 */
router.delete('/rooms/:roomId', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const agent = await getAgent({ tenantId });
    const { roomId } = req.params;

    await agent.modules.groupMessaging.archiveRoom(roomId);

    res.json({
      success: true,
      message: 'Room archived successfully'
    });
  } catch (error) {
    console.error('Error archiving room:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/groups/rooms/:roomId/remove-member
 * Remove a member from a room (admin only)
 */
router.post('/rooms/:roomId/remove-member', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const agent = await getAgent({ tenantId });
    const { roomId } = req.params;
    const { memberDid, reason } = req.body;

    // Get the primary DID for this tenant
    const did = await getPrimaryDid(tenantId);

    await agent.modules.groupMessaging.removeMember({
      roomId,
      moderatorDid: did,
      memberDid,
      reason: reason || 'Removed by admin'
    });

    res.json({
      success: true,
      message: 'Member removed successfully'
    });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/groups/invitations
 * Get pending group invitations (JoinTokenMessages received via DIDComm)
 *
 * NOTE: This is a simplified implementation.
 * In production, you'd want a proper notification/inbox system.
 */
router.get('/invitations', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const agent = await getAgent({ tenantId });

    // For now, return empty array
    // TODO: Implement proper invitation storage/retrieval
    // This would involve listening to DIDComm messages and storing JoinTokenMessages

    res.json({
      success: true,
      invitations: [],
      message: 'Group invitations are sent via DIDComm. UI for viewing invitations coming soon.'
    });
  } catch (error) {
    console.error('Error getting invitations:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

export default router;
