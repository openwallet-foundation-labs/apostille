import { Router, Request, Response } from 'express';
import { getAgent } from '../services/agentService';
import { ConnectionRecord } from '@credo-ts/core';
import { auth } from '../middleware/authMiddleware';

const router = Router();

/**
 * Get all connections for an agent
 */
router.route('/')
  .get(auth, async (req: Request, res: Response) => {
    try {
      const tenantId = req.user.tenantId;

      if (!tenantId) {
        res.status(400).json({
          success: false,
          message: 'Tenant ID not found in authentication token'
        });
        return;
      }

      const agent = await getAgent({ tenantId });
      const invitations = await agent.oob.getAll();
      // console.log(`Invitations: ${JSON.stringify(invitations)}`);
      const connections = await agent.connections.getAll();
      // console.log(`Connections: ${JSON.stringify(connections)}`);
      // remove if State is done
      const filteredInvitations = invitations.filter((invitation: any) => invitation.state !== 'done');
      res.status(200).json({
        success: true,
        invitations: filteredInvitations.map((invitation: any) => ({
          id: invitation.id,
          createdAt: invitation.createdAt,
          state: invitation.state,
          role: invitation.role,
          invitationId: invitation.outOfBandInvitation['@id'],
          label: invitation.outOfBandInvitation.label,
          url: invitation.outOfBandInvitation.toUrl ?
            invitation.outOfBandInvitation.toUrl({ domain: agent.config.endpoints[0] }) :
            null
        })),
        connections: connections.map((connection: any) => ({
          id: connection.id,
          createdAt: connection.createdAt,
          state: connection.state,
          role: connection.role,
          theirLabel: connection.theirLabel,
          theirDid: connection.theirDid
        }))
      });
    } catch (error: any) {
      console.error('Failed to get connections:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get connections'
      });
    }
  });

/**
 * Get a connection by ID
 */
router.route('/:connectionId')
  .get(auth, async (req: Request, res: Response) => {
    try {
      const { connectionId } = req.params;
      const tenantId = req.user.tenantId;

      if (!tenantId) {
        res.status(400).json({
          success: false,
          message: 'Tenant ID not found in authentication token'
        });
        return;
      }

      const agent = await getAgent({ tenantId });
      const connection = await agent.connections.findById(connectionId);

      if (!connection) {
        res.status(404).json({
          success: false,
          message: `Connection with ID ${connectionId} not found`
        });
        return;
      }

      res.status(200).json({
        success: true,
        connection: {
          id: connection.id,
          createdAt: connection.createdAt,
          state: connection.state,
          role: connection.role,
          theirLabel: connection.theirLabel,
          theirDid: connection.theirDid,
          threadId: connection.threadId,
          autoAcceptConnection: connection.autoAcceptConnection
        }
      });
    } catch (error: any) {
      console.error(`Failed to get connection ${req.params.connectionId}:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get connection'
      });
    }
  });

/**
 * Create a new invitation
 */
router.route('/invitation')
  .post(auth, async (req: Request, res: Response) => {
    try {
      const tenantId = req.user.tenantId;
      const { label } = req.body as { label?: string };
      if (!tenantId) {
        res.status(400).json({
          success: false,
          message: 'Tenant ID not found in authentication token'
        });
        return;
      }

      const agent = await getAgent({ tenantId });

      const { outOfBandInvitation } = await agent.oob.createInvitation({
        multiUseInvitation: true,
        // Allow custom label for invitation when provided by UI
        ...(label ? { label } : {}),
      });

      // Use this agent's configured HTTP endpoint for invitation domain
      const invitationUrl = outOfBandInvitation.toUrl({ domain: agent.config.endpoints[0] });

      res.status(200).json({
        success: true,
        invitation: {
          id: outOfBandInvitation.id,
          url: invitationUrl,
          outOfBandInvitation
        }
      });
    } catch (error: any) {
      console.error('Failed to create invitation:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create invitation'
      });
    }
  });

/**
 * Receive an invitation from a URL
 */
router.route('/receive-invitation')
  .post(auth, async (req: Request, res: Response) => {
    try {
      const tenantId = req.user.tenantId;
      const { invitationUrl } = req.body;

      if (!invitationUrl) {
        res.status(400).json({
          success: false,
          message: 'Invitation URL is required'
        });
        return;
      }

      const agent = await getAgent({ tenantId });

      const { connectionRecord } = await agent.oob.receiveInvitationFromUrl(invitationUrl);

      if (!connectionRecord) {
        res.status(400).json({
          success: false,
          message: 'Failed to create connection from invitation'
        });
        return;
      }

      res.status(200).json({
        success: true,
        connection: {
          id: connectionRecord.id,
          state: connectionRecord.state,
          role: connectionRecord.role,
          theirLabel: connectionRecord.theirLabel,
          createdAt: connectionRecord.createdAt
        }
      });
    } catch (error: any) {
      console.error('Failed to receive invitation:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to receive invitation'
      });
    }
  });

/**
 * Send a message to a connection
 */
router.route('/message')
  .post(auth, async (req: Request, res: Response) => {
    try {
      const tenantId = req.user.tenantId;
      const { connectionId, message } = req.body;

      if (!connectionId || !message) {
        res.status(400).json({
          success: false,
          message: 'Connection ID and message are required'
        });
        return;
      }

      const agent = await getAgent({ tenantId });

      const connection = await agent.connections.findById(connectionId);

      if (!connection) {
        res.status(404).json({
          success: false,
          message: `Connection with ID ${connectionId} not found`
        });
        return;
      }

      const m = await agent.basicMessages.sendMessage(connection.id, message);
      console.log(`Message sent to connection ${connectionId}: ${message}`);



      res.status(200).json({
        success: true,
        message: m
      });
    } catch (error: any) {
      console.error('Failed to send message:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to send message'
      });
    }
  });

/**
 * Get messages for a connection
 */
router.route('/messages/:connectionId')
  .get(async (req: Request, res: Response) => {
    try {
      const { connectionId } = req.params;
      const tenantId = req.user.tenantId;

      if (!tenantId) {
        res.status(400).json({
          success: false,
          message: 'Tenant ID not found in authentication token'
        });
        return;
      }

      const agent = await getAgent({ tenantId });
      const connection = await agent.connections.findById(connectionId);

      if (!connection) {
        res.status(404).json({
          success: false,
          message: `Connection with ID ${connectionId} not found`
        });
        return;
      }


      const threadId = connection.threadId;
      if (!threadId) {
        res.status(400).json({
          success: false,
          message: 'Thread ID is required'
        });
        return;
      }
      const messages = await agent.basicMessages.findAllByQuery({
        connectionId: connectionId
      })
      console.log(`Messages: ${JSON.stringify(messages)}`);
      res.status(200).json({
        success: true,
        messages: messages
      });
    } catch (error: any) {
      console.error('Failed to get messages:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get messages'
      });
    }
  });
export default router; 
