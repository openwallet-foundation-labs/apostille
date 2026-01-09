import { Router, Request, Response } from 'express';
import { getAgent } from '../services/agentService';
import { auth } from '../middleware/authMiddleware';
import { DidExchangeState } from '@credo-ts/core';

const router = Router();

export interface DashboardStats {
  connections: {
    total: number;
    active: number;
  };
  credentials: {
    total: number;
    issued: number;
    received: number;
  };
  invitations: {
    pending: number;
  };
  tenant?: {
    id: string;
    label?: string;
  };
}

/**
 * Get dashboard stats endpoint
 */
router.route('/stats')
  .post(auth, async (req: Request, res: Response) => {
    try {
      const tenantId = req.user.tenantId;
      
      if (!tenantId) {
        res.status(400).json({
          success: false,
          message: 'Tenant ID not found in authentication token'
        });
        return;
      }

      try {
        const agent = await getAgent({ tenantId });
        
        // Get connections
        const invitations = await agent.oob.getAll();
        const pendingInvitations = invitations.filter(inv => inv.state !== 'done').length;
        
        const connections = await agent.connections.getAll();
        const totalConnections = connections.length;
        const activeConnections = connections.filter(conn => {
          return conn.state === DidExchangeState.Completed;
        }).length;
        
        // Get credentials 
        const credentials = await agent.credentials.getAll();
        const totalCredentials = credentials.length;
        const issuedCredentials = credentials.filter(cred => cred.state === 'done' && cred.role === 'issuer').length;
        const receivedCredentials = credentials.filter(cred => cred.state === 'done' && cred.role === 'holder').length;
        
        res.status(200).json({
          success: true,
          connections: {
            total: totalConnections,
            active: activeConnections
          },
          credentials: {
            total: totalCredentials,
            issued: issuedCredentials,
            received: receivedCredentials
          },
          invitations: {
            pending: pendingInvitations
          },
          tenant: {
            id: tenantId
          }
        });
      } catch (error) {
        console.error(`Error getting tenant with ID ${tenantId}:`, error);
        res.status(404).json({
          success: false,
          message: `Tenant not found: ${error}`
        });
      }
    } catch (error: any) {
      console.error('Dashboard stats error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get dashboard stats'
      });
    }
  });

export default router; 