import { Router, Request, Response } from 'express';
import { getAgent } from '../services/agentService';
import { DidCreateOptions } from '@credo-ts/core';
import { EthereumDidCreateOptions } from '../plugins/kanon/dids/KanonDidRegistrar';
import { auth } from '../middleware/authMiddleware';

const router = Router();

/**
 * Get all DIDs for a tenant
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
        const dids = await agent.dids.getCreatedDids({});


        const formattedDids = dids.map(did => ({
            did: did.did,
            method: did.did.split(':')[1], // Extract method from did:method:...
            createdAt: did.createdAt
        }));

        res.status(200).json({
            success: true,
            dids: formattedDids
        });
    } catch (error: any) {
        console.error('Failed to get DIDs:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get DIDs'
        });
    }
  })
  .post(auth, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user.tenantId;
        const { method } = req.body;

        if (!method) {
            res.status(400).json({
                success: false,
                message: 'Method is required'
            });
            return;
        }

        const agent = await getAgent({ tenantId });
        
        let didOptions: any;
        
        if (method === 'kanon') {
            didOptions = {
                method: 'kanon',
                secret: {
                    verificationMethod: {
                        id: 'key-1',
                        type: 'EcdsaSecp256k1VerificationKey2019'
                    }
                },
                network: 'testnet'
                
            };
        } else {

            didOptions = {
                method: 'cheqd',
                secret: {
                    verificationMethod: {
                        id: 'key-1',
                        type: 'Ed25519VerificationKey2020',
                    },
                },
                options: {
                    network: 'testnet',
                    methodSpecificIdAlgo: 'uuid',
                }
            };
        }
        
        console.log(`Creating DID with method: ${method}`);
        const didResult = await agent.dids.create(didOptions);
        
        if (didResult.didState.state !== 'finished' || !didResult.didState.did) {
            const errorMessage = didResult.didState.state === 'failed' 
                ? (didResult.didState as any).reason || 'Unknown error' 
                : 'Failed to create DID';
            
            res.status(500).json({
                success: false,
                message: 'Failed to create DID',
                error: errorMessage
            });
            return;
        }

        res.status(201).json({
            success: true,
            message: 'DID created successfully',
            did: {
                did: didResult.didState.did,
                method: method,
                createdAt: new Date().toISOString()
            }
        });
    } catch (error: any) {
        console.error('Failed to create DID:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create DID'
        });
    }
  });

export default router; 