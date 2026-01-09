import { Router, Request, Response } from 'express';
import { getAgent, validateCredentials, createTenant } from '../services/agentService';

const router = Router();

/**
 * Initialize or get an agent for a wallet
 */
router.route('/initialize')
  .post(async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.body;
      
      if (!tenantId) {
        res.status(400).json({ 
          success: false, 
          message: 'Tenant ID is required' 
        });
        return;
      }

      const agent = await getAgent({ tenantId });
      
      res.status(200).json({
        success: true,
        message: 'Agent initialized successfully',
        tenantId
      });
    } catch (error: any) {
      console.error('Failed to initialize agent:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to initialize agent'
      });
    }
  });

/**
 * Validate wallet credentials
 */
router.route('/validate')
  .post(async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.body;
      
      if (!tenantId) {
        res.status(400).json({ 
          success: false, 
          message: 'Tenant ID is required' 
        });
        return;
      }

      const isValid = await validateCredentials(tenantId);
      
      res.status(200).json({
        success: isValid,
        message: isValid ? 'Credentials are valid' : 'Invalid credentials'
      });
    } catch (error: any) {
      console.error('Failed to validate credentials:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to validate credentials'
      });
    }
  });

/**
 * Create a new tenant
 */
router.route('/tenant')
  .post(async (req: Request, res: Response) => {
    try {
      const { walletId, walletKey, label } = req.body;
      
      if (!walletId || !walletKey || !label) {
        res.status(400).json({ 
          success: false, 
          message: 'Wallet ID, key, and tenant label are required' 
        });
        return;
      }

      const tenant = await createTenant({ label });
      
      res.status(200).json({
        success: true,
        message: 'Tenant created successfully',
        tenantId: tenant.tenantId
      });
    } catch (error: any) {
      console.error('Failed to create tenant:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create tenant'
      });
    }
  });

export default router; 