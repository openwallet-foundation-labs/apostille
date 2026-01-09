import { Router, Request, Response } from 'express';
import { getAgent } from '../services/agentService';
import { auth } from '../middleware/authMiddleware';

const router = Router();

/**
 * Get all schemas for an agent
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

        const schemas = await agent.modules.anoncreds.getCreatedSchemas({});

        res.status(200).json({
            success: true,
            schemas
        });
    } catch (error: any) {
        console.error('Failed to get schemas:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get schemas'
        });
    }
  })
  .post(auth, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user.tenantId;
        // Default to cheqd if not specified as it's more reliable
        const { name, version, attributes, provider = 'cheqd', issuerId: requestedIssuerId } = req.body;

        if (!name || !version || !attributes) {
            res.status(400).json({
                success: false,
                message: 'Schema name, version, and attributes are required'
            });
            return;
        }

        const agent = await getAgent({ tenantId });

        try {
            const dids = await agent.dids.getCreatedDids({});
            const availableDids = dids.map(d => ({ did: d.did, type: d.did.split(':')[1], createdAt: d.createdAt }));
            console.log("Available DIDs:", availableDids);
            
            let issuerDid = '';
            
            // If a specific issuer ID was requested, use it
            if (requestedIssuerId) {
                issuerDid = requestedIssuerId;
                console.log(`Using explicitly provided issuer DID: ${issuerDid}`);
            } 
            // Otherwise find a matching DID for the requested provider
            else {
                // First, strictly check for a matching DID
                const matchingDids = dids.filter(did => {
                    if (provider === 'cheqd') return did.did.startsWith('did:cheqd');
                    if (provider === 'kanon') return did.did.startsWith('did:kanon');
                    return false;
                });
                
                if (matchingDids.length > 0) {
                    // Use the most recently created matching DID
                    const sortedDids = matchingDids.sort((a, b) => 
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    );
                    issuerDid = sortedDids[0].did;
                    console.log(`Found ${matchingDids.length} matching ${provider} DIDs, using: ${issuerDid}`);
                } else {
                    console.log(`No matching ${provider} DIDs found`);
                    
                    // If no matching DIDs, return an error with available DIDs for debugging
                    res.status(400).json({
                        success: false,
                        message: `No ${provider} DIDs found. Please create a ${provider} DID first before creating a schema.`,
                        availableDids
                    });
                    return;
                }
            }
            
            // Validate that the issuerDid matches the selected provider
            const didMethod = issuerDid.split(':')[1];
            if ((provider === 'cheqd' && didMethod !== 'cheqd') || 
                (provider === 'kanon' && didMethod !== 'kanon')) {
                res.status(400).json({
                    success: false,
                    message: `Issuer DID type (${didMethod}) does not match selected provider (${provider})`,
                    availableDids
                });
                return;
            }
            
            // Log clear summary
            console.log(`Schema creation with provider: ${provider}, issuer DID: ${issuerDid}`);
            console.log(`Schema details - name: ${name}, version: ${version}, attributes:`, attributes);

            // Ensure we have correct options structure based on the provider
            let schemaOptions;
            
            if (provider === 'kanon') {
                schemaOptions = {
                    network: "testnet",
                    options: {
                        methodSpecificIdAlgo: "uuid",
                        method: "kanon",
                        network: "testnet",
                    },
                    schema: {
                        attrNames: attributes,
                        issuerId: issuerDid,
                        name,
                        version
                    }
                };
            } else { // cheqd
                schemaOptions = {
                    network: "testnet",
                    options: {
                        network: "testnet",
                        methodSpecificIdAlgo: "uuid",
                        method: "cheqd",
                    },
                    schema: {
                        attrNames: attributes,
                        issuerId: issuerDid,
                        name,
                        version
                    }
                };
            }
            
            // Validate schema options before proceeding
            if (!schemaOptions.schema.issuerId || 
                schemaOptions.schema.issuerId === '') {
                throw new Error('A valid issuer DID is required for schema creation');
            }
            
            console.log('Registering schema with options:', JSON.stringify(schemaOptions, null, 2));
            
            const schemaResult = await agent.modules.anoncreds.registerSchema(schemaOptions);
            console.log('Schema registration result:', schemaResult);
            
            if (schemaResult.schemaState.state !== 'finished') {
                res.status(500).json({
                    success: false,
                    message: 'Failed to register schema',
                    error: schemaResult.schemaState.reason,
                    schemaOptions,
                    availableDids
                });
                return;
            }

            res.status(201).json({
                success: true,
                message: 'Schema created successfully',
                schema: schemaResult.schemaState.schemaId,
                provider,
                issuerDid
            });
        } catch (error: any) {
            console.error(`Error creating schema:`, error);
            res.status(500).json({
                success: false,
                message: error.message || 'Unknown error creating schema',
                error: error.toString()
            });
        }
    } catch (error: any) {
        console.error('Failed to create schema:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create schema'
        });
    }
  });

/**
 * Get available DIDs for schema creation
 */
router.route('/available-dids')
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
      
      // Group DIDs by type
      const didsByType: Record<string, any[]> = {};
      
      dids.forEach(did => {
        const parts = did.did.split(':');
        const type = parts.length > 1 ? parts[1] : 'unknown';
        
        if (!didsByType[type]) {
          didsByType[type] = [];
        }
        
        didsByType[type].push({
          did: did.did,
          createdAt: did.createdAt
        });
      });
      
      res.status(200).json({
        success: true,
        dids: dids.map(d => ({
          did: d.did,
          type: d.did.split(':')[1], 
          createdAt: d.createdAt
        })),
        didsByType
      });
    } catch (error: any) {
      console.error(`Failed to get available DIDs:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get available DIDs'
      });
    }
  });

/**
 * Get a schema by schema ID
 */
router.route('/schemaId')
  .get(auth, async (req: Request, res: Response) => {
    try {
      const tenantId = req.user.tenantId;
      const { schemaId } = req.query as {
        schemaId?: string;
      };

      if (!tenantId) {
        res.status(400).json({   
          success: false,
          message: 'Tenant ID not found in authentication token'
        });
        return;
      }

      if (!schemaId) {
        res.status(400).json({
          success: false,
          message: 'Schema ID is required as query parameter'
        });
        return;
      }

      const agent = await getAgent({ tenantId });
      
      try {
        const schema = await agent.modules.anoncreds.getSchema(schemaId);
        
        if (!schema) {
            res.status(404).json({
                success: false,
                message: `Schema with ID ${schemaId} not found`
            });
            return;
        }

        res.status(200).json({
            success: true,
            schema
        });
      } catch (error: any) {
        console.error(`Failed to get schema with ID ${schemaId}:`, error);
        res.status(404).json({
            success: false,
          message: `Schema with ID ${schemaId} not found: ${error.message}`
        });
      }
    } catch (error: any) {
      console.error(`Failed to get schema by schema ID:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get schema by schema ID'
      });
    }
  });

/**
 * Get a schema by ID
 */
router.route('/:schemaId')
  .get(auth, async (req: Request, res: Response) => {
    try {
        const { schemaId } = req.params;
        console.log('schemaId', schemaId);
        console.log('req.query', req.query);
        const tenantId = req.user.tenantId;

        if (!tenantId) {
            res.status(400).json({
                success: false,
                message: 'Tenant ID not found in authentication token'
            });
            return;
        }

        const agent = await getAgent({ tenantId });
        const schemas = await agent.modules.anoncreds.getCreatedSchemas({});
        const schema = schemas.find((s: any) => s.id === schemaId);
        if (!schema) {
            res.status(404).json({
                success: false,
                message: `Schema with ID ${schemaId} not found`
            });
            return;
        }

        res.status(200).json({
            success: true,
            schema
        });
    } catch (error: any) {
        console.error(`Failed to get schema ${req.params.schemaId}:`, error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get schema'
        });
    }
  });

export default router; 