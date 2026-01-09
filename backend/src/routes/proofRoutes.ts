import { Router, Request, Response } from 'express';
import { getAgent } from '../services/agentService';
import { ProofExchangeRecord, AutoAcceptProof } from '@credo-ts/core';
import { auth } from '../middleware/authMiddleware';

const router = Router();

/**
 * Get all proof records for an agent
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
      const proofs = await agent.proofs.getAll();
      
      res.status(200).json({
        success: true,
        proofs: proofs.map((proof: ProofExchangeRecord) => ({
          id: proof.id,
          state: proof.state,
          createdAt: proof.createdAt,
          connectionId: proof.connectionId,
          threadId: proof.threadId,
          isVerified: proof.isVerified
        }))
      });
    } catch (error: any) {
      console.error('Failed to get proofs:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get proofs'
      });
    }
  });

/**
 * Send a proof request to a connection
 */
router.route('/request')
  .post(auth, async (req: Request, res: Response) => {
    try {
      const tenantId = req.user.tenantId;
      const { connectionId, proofAttributes, credentialDefinitionId } = req.body;
      
      if (!connectionId || !proofAttributes) {
        res.status(400).json({ 
          success: false, 
          message: 'Connection ID and proof attributes are required' 
        });
        return;
      }

      const agent = await getAgent({ tenantId });
      
      // Format the requested attributes based on the new structure
      const requestedAttributes: Record<string, any> = {};
      
      // Handle both array format and object format
      if (Array.isArray(proofAttributes)) {
        // Convert array format to object format with restrictions
        proofAttributes.forEach((attr) => {
          const attrName = attr.name;
          
          requestedAttributes[attrName] = {
            name: attrName,
            restrictions: credentialDefinitionId ? 
              [{ cred_def_id: credentialDefinitionId }] : 
              (attr.restrictions || [])
          };
        });
      } else if (typeof proofAttributes === 'object') {
        // Use the object format directly
        Object.assign(requestedAttributes, proofAttributes);
      }
      
      console.log('Formatted requested attributes:', JSON.stringify(requestedAttributes, null, 2));
      
      // Send the proof request
      const proofRecord = await agent.proofs.requestProof({
        connectionId,
        protocolVersion: 'v2',
        proofFormats: {
          anoncreds: {
            name: 'Proof Request',
            version: '1.0',
            requested_attributes: requestedAttributes
          }
        },
        autoAcceptProof: AutoAcceptProof.Always
      });
      
      res.status(200).json({
        success: true,
        proof: {
          id: proofRecord.id,
          state: proofRecord.state,
          connectionId: proofRecord.connectionId,
          threadId: proofRecord.threadId
        }
      });
    } catch (error: any) {
      console.error('Failed to request proof:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to request proof'
      });
    }
  });

/**
 * Accept a proof request
 */
router.route('/:proofId/accept')
  .post(auth, async (req: Request, res: Response) => {
    try {
      const { proofId } = req.params;
      const tenantId = req.user.tenantId;
      const { selectedCredentials } = req.body;
      console.log(JSON.stringify(req.body, null, 2), "req.body");

      if (!selectedCredentials) {
        res.status(400).json({ 
          success: false, 
          message: 'Selected credentials are required' 
        });
        return;
      }

      const agent = await getAgent({ tenantId });
      const proofRecord = await agent.proofs.findById(proofId);
      
      if (!proofRecord) {
        res.status(404).json({
          success: false,
          message: `Proof record with ID ${proofId} not found`
        });
        return;
      }
      
      // Try to automatically select credentials
      let requestedCredentials;
      try {
        console.log('Attempting automatic credential selection for proof:', proofId);
        requestedCredentials = await agent.proofs.selectCredentialsForRequest({
          proofRecordId: proofRecord.id,
        });
        console.log('Automatic credential selection successful:', JSON.stringify(requestedCredentials, null, 2));
      } catch (error: any) {
        console.error('Failed to automatically select credentials:', error);
        requestedCredentials = {
          proofFormats: {
            anoncreds: {
              requested_attributes: selectedCredentials
            }
          }
        }
      }
      console.log('Final proof format for acceptRequest:', JSON.stringify(requestedCredentials, null, 2));
      console.log('Proof record:', JSON.stringify(proofRecord, null, 2));
      console.log('Proof ID:', proofId);
      // Accept the proof request with selected credentials
      await agent.proofs.acceptRequest({
        proofRecordId: proofId,
        proofFormats: requestedCredentials.proofFormats
      });
      
      // Get updated proof record
      const updatedProofRecord = await agent.proofs.findById(proofId);
      
      if (!updatedProofRecord) {
        res.status(404).json({
          success: false,
          message: `Updated proof record with ID ${proofId} not found`
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        proof: {
          id: updatedProofRecord.id,
          state: updatedProofRecord.state,
          connectionId: updatedProofRecord.connectionId,
          threadId: updatedProofRecord.threadId
        }
      });
    } catch (error: any) {
      console.error(`Failed to accept proof request ${req.params.proofId}:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to accept proof request'
      });
    }
  });

/**
 * Get a proof record by ID
 */
router.route('/:proofId')
  .get(auth, async (req: Request, res: Response) => {
    try {
      const { proofId } = req.params;
      const tenantId = req.user.tenantId;
      
      if (!tenantId) {
        res.status(400).json({ 
          success: false, 
          message: 'Tenant ID not found in authentication token' 
        });
        return;
      }

      const agent = await getAgent({ tenantId });
      const proof = await agent.proofs.findById(proofId);
      
      if (!proof) {
        res.status(404).json({
          success: false,
          message: `Proof with ID ${proofId} not found`
        });
        return;
      }
      
      // Safely include messages by accessing them through the record
      const proofData: any = {
        id: proof.id,
        state: proof.state,
        createdAt: proof.createdAt,
        connectionId: proof.connectionId,
        threadId: proof.threadId,
        isVerified: proof.isVerified
      };
      
      // Include request and presentation messages if available
      if ('requestMessage' in proof) {
        proofData.requestMessage = (proof as any).requestMessage;
        
        // Try to extract requested attributes from different possible locations
        try {
          if ((proof as any).requestMessage?.presentations_attach?.[0]?.data?.base64) {
            const base64Data = (proof as any).requestMessage.presentations_attach[0].data.base64;
            const decodedData = JSON.parse(Buffer.from(base64Data, 'base64').toString('utf-8'));
            proofData.requestedAttributes = decodedData.requested_attributes || {};
          } else if ((proof as any).requestMessage?.request_presentations_attach?.[0]?.data?.base64) {
            const base64Data = (proof as any).requestMessage.request_presentations_attach[0].data.base64;
            const decodedData = JSON.parse(Buffer.from(base64Data, 'base64').toString('utf-8'));
            proofData.requestedAttributes = decodedData.requested_attributes || {};
          }
        } catch (error) {
          console.error('Failed to decode proof request data:', error);
        }
      }
      
      // Include presentation message if available
      if ('presentationMessage' in proof) {
        proofData.presentationMessage = (proof as any).presentationMessage;
      }
      
      res.status(200).json({
        success: true,
        proof: proofData
      });
    } catch (error: any) {
      console.error(`Failed to get proof ${req.params.proofId}:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get proof'
      });
    }
  });

export default router; 