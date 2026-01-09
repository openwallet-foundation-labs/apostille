import { Router, Request, Response } from 'express';
import { getAgent } from '../services/agentService';
import { RegisterCredentialDefinitionOptions } from '@credo-ts/anoncreds';
import { auth } from '../middleware/authMiddleware';
import { db } from '../db/driver';
import {
  MDL_DOCTYPE,
  MID_DOCTYPE,
  getDefaultNamespaces,
  getAttributesForDoctype,
  validateMdlData,
  SUPPORTED_DOCTYPES
} from '../utils/mdlUtils';

const router = Router();

// Base URL for OpenID4VC
const apiBaseUrl = process.env.API_URL || process.env.PUBLIC_URL || 'http://localhost:3002';

/**
 * Get all credential definitions for an agent
 * Returns both AnonCreds (from agent) and OID4VC (from database) credential definitions
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

      // Get AnonCreds credential definitions from agent
      const anonCredsCredDefs = await agent.modules.anoncreds.getCreatedCredentialDefinitions({});

      // Add format marker to AnonCreds definitions
      const anonCredsWithFormat = anonCredsCredDefs.map((credDef: any) => ({
        ...credDef,
        format: 'anoncreds'
      }));

      // Get OID4VC and mdoc credential definitions from database
      let dbCredDefs: any[] = [];
      try {
        const result = await db.query(
          'SELECT * FROM credential_definitions WHERE tenant_id = $1 AND format IN ($2, $3) ORDER BY created_at DESC',
          [tenantId, 'oid4vc', 'mso_mdoc']
        );
        dbCredDefs = result.rows.map(row => ({
          credentialDefinitionId: row.credential_definition_id,
          credentialDefinition: {
            issuerId: `did:web:${new URL(apiBaseUrl).hostname}:issuers:${tenantId}`,
            schemaId: row.schema_id,
            tag: row.tag,
          },
          schemaId: row.schema_id,
          tag: row.tag,
          overlay: row.overlay,
          schemaAttributes: row.schema_attributes,
          format: row.format,
          // mdoc-specific fields
          doctype: row.doctype,
          namespaces: row.namespaces,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
      } catch (dbError: any) {
        console.warn('Failed to fetch credential definitions from database:', dbError.message);
        // Continue without database definitions if table doesn't exist yet
      }

      // Combine both types
      const allCredentialDefinitions = [...anonCredsWithFormat, ...dbCredDefs];

      res.status(200).json({
        success: true,
        credentialDefinitions: allCredentialDefinitions
      });
    } catch (error: any) {
      console.error('Failed to get credential definitions:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get credential definitions'
      });
    }
  })
  .post(auth, async (req: Request, res: Response) => {
    try {
      const tenantId = req.user.tenantId;
      const { schemaId, tag, supportRevocation, overlay, format = 'anoncreds', doctype, namespaces } = req.body;
      console.log(req.body, "req.body");

      // For mdoc, schemaId is optional (we use doctype/namespaces instead)
      if (format !== 'mso_mdoc' && (!schemaId || !tag)) {
        res.status(400).json({
          success: false,
          message: 'Schema ID and tag are required'
        });
        return;
      }

      if (format === 'mso_mdoc' && !tag) {
        res.status(400).json({
          success: false,
          message: 'Tag is required'
        });
        return;
      }

      // Validate format
      if (!['anoncreds', 'oid4vc', 'mso_mdoc'].includes(format)) {
        res.status(400).json({
          success: false,
          message: 'Format must be "anoncreds", "oid4vc", or "mso_mdoc"'
        });
        return;
      }

      const agent = await getAgent({ tenantId });

      // Handle mso_mdoc format - mdoc/mDL credentials
      if (format === 'mso_mdoc') {
        try {
          // Use provided doctype or default to mDL
          const mdocDoctype = doctype || MDL_DOCTYPE;

          // Generate namespaces from doctype if not provided
          const mdocNamespaces = namespaces || getDefaultNamespaces(mdocDoctype);

          // Generate credential definition ID using did:web
          const hostname = new URL(apiBaseUrl).hostname;
          const credentialDefinitionId = `did:web:${hostname}:issuers:${tenantId}:mdoc:${tag}`;

          // Check if credential definition with same tag already exists
          const existingCheck = await db.query(
            'SELECT id FROM credential_definitions WHERE tenant_id = $1 AND tag = $2 AND format = $3',
            [tenantId, tag, 'mso_mdoc']
          );

          if (existingCheck.rows.length > 0) {
            res.status(409).json({
              success: false,
              message: `mdoc credential definition with tag "${tag}" already exists for this tenant`
            });
            return;
          }

          // Get attribute names from namespaces for schema_attributes
          const attributeNames = Object.values(mdocNamespaces)
            .flatMap((ns: any) => Object.keys(ns));

          // Store in database
          const result = await db.query(`
            INSERT INTO credential_definitions (
              tenant_id, credential_definition_id, schema_id, tag, format, overlay, schema_attributes, doctype, namespaces
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, credential_definition_id
          `, [
            tenantId,
            credentialDefinitionId,
            schemaId || `mdoc:${mdocDoctype}`, // Use doctype as pseudo-schema for mdoc
            tag,
            'mso_mdoc',
            overlay ? JSON.stringify(overlay) : null,
            JSON.stringify(attributeNames),
            mdocDoctype,
            JSON.stringify(mdocNamespaces)
          ]);

          console.log('mdoc credential definition created:', result.rows[0]);

          res.status(201).json({
            success: true,
            message: 'mdoc credential definition created successfully',
            credentialDefinitionId: result.rows[0].credential_definition_id,
            format: 'mso_mdoc',
            doctype: mdocDoctype,
            namespaces: mdocNamespaces,
            issuerUrl: `${apiBaseUrl}/issuers/${tenantId}`,
            issuerMetadataUrl: `${apiBaseUrl}/issuers/${tenantId}/.well-known/openid-credential-issuer`
          });
          return;
        } catch (dbError: any) {
          console.error('Failed to create mdoc credential definition:', dbError);
          res.status(500).json({
            success: false,
            message: dbError.message || 'Failed to create mdoc credential definition'
          });
          return;
        }
      }

      // Get schema for attribute names (required for anoncreds and oid4vc)
      const schemaResult = await agent.modules.anoncreds.getCreatedSchemas({});
      const schema = schemaResult.find((s: { id: any; }) => s.id === schemaId);
      console.log(schemaResult, "schemaResult");

      if (!schemaResult || !schema) {
        res.status(404).json({
          success: false,
          message: `Schema with ID ${schemaId} not found`
        });
        return;
      }

      console.log('Using schema for credential definition:', schema);

      // Handle OID4VC format - store in database, no ledger registration
      if (format === 'oid4vc') {
        try {
          // Generate credential definition ID using did:web
          const hostname = new URL(apiBaseUrl).hostname;
          const credentialDefinitionId = `did:web:${hostname}:issuers:${tenantId}:creddef:${tag}`;

          // Check if credential definition with same tag already exists
          const existingCheck = await db.query(
            'SELECT id FROM credential_definitions WHERE tenant_id = $1 AND tag = $2 AND format = $3',
            [tenantId, tag, 'oid4vc']
          );

          if (existingCheck.rows.length > 0) {
            res.status(409).json({
              success: false,
              message: `OID4VC credential definition with tag "${tag}" already exists for this tenant`
            });
            return;
          }

          // Store in database
          const result = await db.query(`
            INSERT INTO credential_definitions (
              tenant_id, credential_definition_id, schema_id, tag, format, overlay, schema_attributes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, credential_definition_id
          `, [
            tenantId,
            credentialDefinitionId,
            schemaId,
            tag,
            'oid4vc',
            overlay ? JSON.stringify(overlay) : null,
            JSON.stringify(schema.schema.attrNames)
          ]);

          console.log('OID4VC credential definition created:', result.rows[0]);

          res.status(201).json({
            success: true,
            message: 'OID4VC credential definition created successfully',
            credentialDefinitionId: result.rows[0].credential_definition_id,
            format: 'oid4vc',
            issuerUrl: `${apiBaseUrl}/issuers/${tenantId}`,
            issuerMetadataUrl: `${apiBaseUrl}/issuers/${tenantId}/.well-known/openid-credential-issuer`
          });
          return;
        } catch (dbError: any) {
          console.error('Failed to create OID4VC credential definition:', dbError);
          res.status(500).json({
            success: false,
            message: dbError.message || 'Failed to create OID4VC credential definition'
          });
          return;
        }
      }

      // Handle AnonCreds format - original ledger registration flow
      // Build credential definition details with optional OCA overlay
      // OCA overlay structure:
      // {
      //   meta: { name, description, issuer, issuer_url, issuer_description },
      //   branding: { primary_background_color, secondary_background_color, primary_attribute, secondary_attribute, logo, background_image }
      // }
      const credDefDetails: {
        tag: string;
        supportRevocation?: boolean;
        overlay?: {
          meta?: {
            name?: string;
            description?: string;
            issuer?: string;
            issuer_url?: string;
            issuer_description?: string;
          };
          branding?: {
            primary_background_color?: string;
            secondary_background_color?: string;
            primary_attribute?: string;
            secondary_attribute?: string;
            logo?: string;
            background_image?: string;
          };
        };
      } = { tag };

      if (supportRevocation !== undefined) {
        credDefDetails.supportRevocation = supportRevocation;
      }

      if (overlay) {
        credDefDetails.overlay = overlay;
      }

      try {
        const schemaIdParts = schemaId.split(':');
        const network = schemaIdParts.length >= 3 ? schemaIdParts[2] : 'testnet';

        const options: RegisterCredentialDefinitionOptions = {
          options: {
            network: network,
            methodSpecificIdAlgo: 'uuid',
          },
          credentialDefinition: {
            issuerId: schema.schema.issuerId, // Use the issuer ID from the schema
            schemaId: schema.schemaId,
            tag,
            type: 'CL',
            value: {
              primary: {
                name: 'primary',
              }
            }
          },
          // @ts-ignore
          network: network,

          issuerId: schema.schema.issuerId
        };

        console.log('Registering credential definition with options:', JSON.stringify(options));
        const isKanon = schema.schema.issuerId.includes('did:kanon');
        let credDefResult;
        if (isKanon) {
          // add type and value if did:kanon
          // Include overlay (OCA branding/meta) if provided
          credDefResult = await agent.modules.anoncreds.registerCredentialDefinition({
            options: {
              network: network,
              methodSpecificIdAlgo: 'uuid',
              // Pass overlay through options for OCA support
              ...(overlay && { overlay }),
            },
            credentialDefinition: {
              issuerId: schema.schema.issuerId, // Use the issuer ID from the schema
              schemaId: schema.schemaId,
              tag,
            },
            // Also pass at root level for backwards compatibility
            // @ts-ignore - custom extension for OCA overlay support
            overlay: overlay || undefined,
          });
          console.log(credDefResult, "credDefResult");
        }
        else {
          credDefResult = await agent.modules.anoncreds.registerCredentialDefinition({
            options: {
              network: network,
            methodSpecificIdAlgo: 'uuid',
          },
          credentialDefinition: {
            issuerId: schema.schema.issuerId, // Use the issuer ID from the schema
            schemaId: schema.schemaId,
            tag,

          }
        });
        console.log(credDefResult, "credDefResult");
      }

        console.log('Credential definition registered:', credDefResult);

        if (credDefResult.credentialDefinitionState.state !== 'finished') {
          res.status(500).json({
            success: false,
            message: 'Failed to register credential definition',
            error: credDefResult.credentialDefinitionState.reason
          });
          return;
        }

        res.status(201).json({
          success: true,
          message: 'Credential definition created successfully',
          credentialDefinitionId: credDefResult.credentialDefinitionState.credentialDefinitionId,
          format: 'anoncreds'
        });
      } catch (error: any) {
        console.error('Failed to register credential definition:', error);
        res.status(500).json({
          success: false,
          message: error.message || 'Failed to register credential definition'
        });
      }
    } catch (error: any) {
      console.error('Failed to create credential definition:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create credential definition'
      });
    }
  });

/**
 * Get a credential definition by full path (includes OCA overlay for Kanon DIDs)
 * This handles paths like: /credential-definitions/did:kanon:testnet:123/resources/456
 */
router.route('/:issuerId/resources/:resourceId')
  .get(auth, async (req: Request, res: Response) => {
    try {
      const { issuerId, resourceId } = req.params;
      const tenantId = req.user.tenantId;

      if (!tenantId) {
        res.status(400).json({
          success: false,
          message: 'Tenant ID not found in authentication token'
        });
        return;
      }

      const credentialDefinitionId = `${issuerId}/resources/${resourceId}`;

      try {
        const agent = await getAgent({ tenantId });
        const credDefs = await agent.modules.anoncreds.getCreatedCredentialDefinitions({
          credentialDefinitionId: credentialDefinitionId
        });
        console.log(credDefs, "credDefsfgfgg");
        const credDef = credDefs[0]
        console.log(credDef, "credDef");
        if (!credDef) {
          res.status(404).json({
            success: false,
            message: `Credential definition with ID ${credentialDefinitionId} not found`
          });
          return;
        }

        // For Kanon DIDs, fetch overlay from ledger
        let overlay = undefined;
        if (credentialDefinitionId.includes('did:kanon')) {
          try {
            const result = await agent.modules.anoncreds.getCredentialDefinition(credentialDefinitionId);
            overlay = (result.credentialDefinitionMetadata as any)?.overlay;
            console.log('Fetched overlay from ledger:', overlay);
          } catch (err) {
            console.warn(`Could not fetch overlay for ${credentialDefinitionId}:`, err);
          }
        }

        res.status(200).json({
          success: true,
          credentialDefinition: credDef,
          schemaId: credDef.credentialDefinition.schemaId,
          overlay
        });
      } catch (error: any) {
        console.error(`Failed to get credential definition ${credentialDefinitionId}:`, error);
        res.status(500).json({
          success: false,
          message: error.message || 'Failed to get credential definition'
        });
      }
    } catch (error: any) {
      console.error(`Failed to get credential definition:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get credential definition'
      });
    }
  });

/**
 * Get overlay (OCA branding/meta) for a credential definition - PUBLIC endpoint
 * This endpoint does not require authentication so wallets can fetch branding
 * Path: /credential-definitions/:credDefId/overlay
 * NOTE: This route MUST be defined before /:credDefId to ensure proper matching
 */
router.route('/:credDefId/overlay')
  .get(async (req: Request, res: Response) => {
    try {
      const { credDefId } = req.params;

      // For Kanon DIDs, we need to fetch from the ledger
      if (credDefId.includes('did:kanon')) {
        try {
          // Get the agent (using a default tenant or admin agent)
          const agent = await getAgent({});

          // Fetch credential definition from Kanon ledger
          const result = await agent.modules.anoncreds.getCredentialDefinition(credDefId);

          if (!result.credentialDefinition) {
            res.status(404).json({
              success: false,
              message: `Credential definition with ID ${credDefId} not found`
            });
            return;
          }

          // Extract overlay from metadata (set by KanonAnonCredsRegistry)
          const overlay = (result.credentialDefinitionMetadata as any)?.overlay;

          if (!overlay) {
            res.status(404).json({
              success: false,
              message: `No overlay found for credential definition ${credDefId}`
            });
            return;
          }

          res.status(200).json({
            success: true,
            credentialDefinitionId: credDefId,
            overlay
          });
        } catch (error: any) {
          console.error(`Failed to get overlay for ${credDefId}:`, error);
          res.status(500).json({
            success: false,
            message: error.message || 'Failed to get overlay'
          });
        }
      } else {
        // For non-Kanon DIDs, overlays are not stored on ledger
        res.status(404).json({
          success: false,
          message: `Overlay lookup not supported for non-Kanon credential definitions`
        });
      }
    } catch (error: any) {
      console.error(`Failed to get overlay:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get overlay'
      });
    }
  });

/**
 * Get a credential definition by ID (includes OCA overlay for Kanon DIDs)
 */
router.route('/:credDefId')
  .get(auth, async (req: Request, res: Response) => {
    try {
      const { credDefId } = req.params;
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
        const credDefs = await agent.modules.anoncreds.getCreatedCredentialDefinitions({
          credentialDefinitionId: credDefId
        });

        const credDef = credDefs[0]

        if (!credDef) {
          res.status(404).json({
            success: false,
            message: `Credential definition with ID ${credDefId} not found`
          });
          return;
        }

        // For Kanon DIDs, fetch overlay from ledger
        let overlay = undefined;
        if (credDefId.includes('did:kanon')) {
          try {
            const result = await agent.modules.anoncreds.getCredentialDefinition(credDefId);
            overlay = (result.credentialDefinitionMetadata as any)?.overlay;
          } catch (err) {
            console.warn(`Could not fetch overlay for ${credDefId}:`, err);
          }
        }

        res.status(200).json({
          success: true,
          credentialDefinition: credDef,
          schemaId: credDef.credentialDefinition.schemaId,
          overlay
        });
      } catch (error: any) {
        console.error(`Failed to get credential definition ${credDefId}:`, error);
        res.status(500).json({
          success: false,
          message: error.message || 'Failed to get credential definition'
        });
      }
    } catch (error: any) {
      console.error(`Failed to get credential definition:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get credential definition'
      });
    }
  });

export default router; 