import { Router, Request, Response } from 'express';
import { getAgent } from '../services/agentService';
import { AutoAcceptProof } from '@credo-ts/core';

const router = Router();
// Demo tenant ID - required for demo routes
const DEMO_TENANT_ID = process.env.PLATFORM_TENANT_ID;

// Credential definition IDs for demo
const STUDENT_CRED_DEF_ID = "did:kanon:testnet:351e178d-dd03-40e0-899c-65fe9b86ab66/resources/c51c0dc0-4719-48f2-b5f2-8969c87ef9e0";
const LAWYER_CRED_DEF_ID = "did:kanon:testnet:351e178d-dd03-40e0-899c-65fe9b86ab66/resources/3c62ca2b-b4be-4f9a-b5d8-df4e8e404433";

router.route('/').get(async (req: Request, res: Response) => {
    const { label, goal } = req.query;
    console.log('Demo API called with:', { label, goal });

    if (!DEMO_TENANT_ID) {
        return res.status(503).json({
            message: "error",
            data: "Demo not configured. Set PLATFORM_TENANT_ID environment variable."
        });
    }

    try {
        const _workerAgent = await getAgent({ tenantId: DEMO_TENANT_ID })
        // createInvitation returns OutOfBandRecord directly
        // The record has .id (record ID) and .outOfBandInvitation (the invitation message)
        const outOfBandRecord = await _workerAgent.oob.createInvitation({
            goal: goal as string,
            label: label as string,
            goalCode: goal as string,
        })

        // Use mediator-less flow: advertise our agent's HTTP endpoint
        const invitationUrl = outOfBandRecord.outOfBandInvitation.toUrl({ domain: _workerAgent.config.endpoints[0] });

        // IMPORTANT: Use outOfBandRecord.id (not outOfBandInvitation.id)
        // The connection's outOfBandId field references the record ID, not the invitation message ID
        console.log('Created invitation:', {
            recordId: outOfBandRecord.id,
            invitationId: outOfBandRecord.outOfBandInvitation.id,
            url: invitationUrl
        });

        res.status(200).json({
            message: "success",
            data: {
                id: outOfBandRecord.id,  // Use record ID for connection lookup
                url: invitationUrl,
                outOfBandInvitation: outOfBandRecord.outOfBandInvitation
            }
        })
    } catch (error) {
        console.error('Demo API error:', error);
        res.status(500).json({
            message: "error",
            data: error
        })
    }
})

/**
 * Get connection ID from OOB invitation ID
 * Used to find the connection established after scanning the demo QR code
 */
router.route('/connection/:oobId').get(async (req: Request, res: Response) => {
    const { oobId } = req.params;
    console.log('Demo connection lookup for OOB ID:', oobId);

    try {
        const _workerAgent = await getAgent({ tenantId: DEMO_TENANT_ID });
        const connections = await _workerAgent.connections.getAll();

        // Find a connection with matching outOfBandId that is completed
        const connection = connections.find(c =>
            c.outOfBandId === oobId && c.state === 'completed'
        );

        if (connection) {
            console.log('Found connection for OOB:', { connectionId: connection.id, state: connection.state });
            res.status(200).json({
                success: true,
                connectionId: connection.id,
                state: connection.state
            });
        } else {
            res.status(200).json({
                success: false,
                message: 'Connection not yet established'
            });
        }
    } catch (error: any) {
        console.error('Demo connection lookup error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to lookup connection'
        });
    }
});

/**
 * Request proof verification for demo
 * No auth required - uses hardcoded demo tenant
 */
router.route('/proof').post(async (req: Request, res: Response) => {
    console.log('Demo proof request - raw body:', req.body);
    console.log('Demo proof request - body type:', typeof req.body);

    const { connectionId, userType } = req.body || {};
    console.log('Demo proof request - parsed:', { connectionId, userType });

    if (!connectionId || !userType) {
        console.log('Missing required fields. connectionId:', connectionId, 'userType:', userType);
        res.status(400).json({
            success: false,
            message: 'connectionId and userType are required'
        });
        return;
    }

    try {
        const _workerAgent = await getAgent({ tenantId: DEMO_TENANT_ID });

        // Select credential definition based on userType
        const credDefId = userType === 'student' ? STUDENT_CRED_DEF_ID : LAWYER_CRED_DEF_ID;

        // Fetch the credential definition to get the schema ID
        const credentialDefinition = await _workerAgent.modules.anoncreds.getCredentialDefinition(credDefId);
        if (!credentialDefinition?.credentialDefinition) {
            res.status(500).json({
                success: false,
                message: 'Credential definition not found'
            });
            return;
        }

        // Fetch the schema to get the actual attribute names
        const schemaId = credentialDefinition.credentialDefinition.schemaId;
        const schema = await _workerAgent.modules.anoncreds.getSchema(schemaId);
        if (!schema?.schema?.attrNames) {
            res.status(500).json({
                success: false,
                message: 'Schema not found'
            });
            return;
        }

        // Use the actual attribute names from the schema
        const attributes = schema.schema.attrNames;
        console.log('Schema attributes for proof request:', attributes);

        // Build requested_attributes with restrictions using actual schema attribute names
        const requestedAttributes: Record<string, any> = {};
        attributes.forEach((attr: string) => {
            requestedAttributes[attr] = {
                name: attr,
                restrictions: [{ cred_def_id: credDefId }]
            };
        });

        console.log('Requesting proof with attributes:', requestedAttributes);

        const proofRecord = await _workerAgent.proofs.requestProof({
            connectionId,
            protocolVersion: 'v2',
            proofFormats: {
                anoncreds: {
                    name: 'Demo Proof Request',
                    version: '1.0',
                    requested_attributes: requestedAttributes
                }
            },
            autoAcceptProof: AutoAcceptProof.Always
        });

        console.log('Proof request created:', { proofId: proofRecord.id, state: proofRecord.state });

        res.status(200).json({
            success: true,
            proofId: proofRecord.id,
            state: proofRecord.state
        });
    } catch (error: any) {
        console.error('Demo proof request error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to request proof'
        });
    }
});

/**
 * Get proof status and disclosed attributes for demo
 * No auth required - uses hardcoded demo tenant
 */
router.route('/proof/:proofId').get(async (req: Request, res: Response) => {
    const { proofId } = req.params;
    console.log('Demo proof status lookup:', proofId);

    try {
        const _workerAgent = await getAgent({ tenantId: DEMO_TENANT_ID });
        const proof = await _workerAgent.proofs.findById(proofId);

        if (!proof) {
            res.status(404).json({
                success: false,
                message: 'Proof not found'
            });
            return;
        }

        // Extract disclosed attributes if proof is done and verified
        let disclosedAttributes: Record<string, string> = {};
        if (proof.state === 'done' && proof.isVerified) {
            try {
                // Try to get the format data from the proof record
                const formatData = await _workerAgent.proofs.getFormatData(proofId) as any;
                console.log('Proof format data:', JSON.stringify(formatData, null, 2));

                // Extract from anoncreds presentation
                if (formatData?.presentation?.anoncreds) {
                    const presentation = formatData.presentation.anoncreds as any;
                    if (presentation.requested_proof?.revealed_attrs) {
                        Object.entries(presentation.requested_proof.revealed_attrs).forEach(([key, value]: [string, any]) => {
                            disclosedAttributes[key] = value.raw;
                        });
                    }
                    // Also check revealed_attr_groups for grouped attributes
                    if (presentation.requested_proof?.revealed_attr_groups) {
                        Object.entries(presentation.requested_proof.revealed_attr_groups).forEach(([groupKey, group]: [string, any]) => {
                            if (group.values) {
                                Object.entries(group.values).forEach(([attrKey, attrValue]: [string, any]) => {
                                    disclosedAttributes[attrKey] = attrValue.raw;
                                });
                            }
                        });
                    }
                }

                console.log('Extracted disclosed attributes:', disclosedAttributes);
            } catch (error) {
                console.error('Failed to extract presentation data:', error);
            }
        }

        console.log('Proof status:', { id: proof.id, state: proof.state, isVerified: proof.isVerified, disclosedAttributes });

        res.status(200).json({
            success: true,
            proof: {
                id: proof.id,
                state: proof.state,
                isVerified: proof.isVerified,
                disclosedAttributes
            }
        });
    } catch (error: any) {
        console.error('Demo proof status error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get proof status'
        });
    }
});

export default router;
