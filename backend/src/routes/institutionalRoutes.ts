/**
 * Institutional Credential Issuance Routes
 *
 * Routes for managing institutional credential issuance through various providers.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/driver';
import { ProviderRegistry } from '../services/credentials/ProviderRegistry';
import { InstitutionalIssuanceService } from '../services/credentials/InstitutionalIssuanceService';
import { getESSIAgent, isESSIAgentInitialized } from '../services/credentials/ESSIAgentSetup';

const router = Router();

/**
 * GET /providers
 * Get list of active credential providers
 */
router.get('/providers', async (req: Request, res: Response) => {
    try {
        const client = await db.connect();
        try {
            const result = await client.query(
                'SELECT id, provider_id, name, type, is_active FROM credential_providers WHERE is_active = true'
            );
            res.json({
                success: true,
                providers: result.rows
            });
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('[Institutional] Error fetching providers:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch providers'
        });
    }
});

/**
 * GET /providers/:providerId/credential-types
 * Get supported credential types for a provider
 */
router.get('/providers/:providerId/credential-types', async (req: Request, res: Response) => {
    try {
        const { providerId } = req.params;

        const client = await db.connect();
        try {
            const result = await client.query(
                `SELECT id, credential_type, schema_id, credential_definition_id, is_active
                FROM institutional_credential_types
                WHERE provider_id = $1 AND is_active = true`,
                [providerId]
            );
            res.json({
                success: true,
                credentialTypes: result.rows
            });
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('[Institutional] Error fetching credential types:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch credential types'
        });
    }
});

/**
 * POST /issuance/start
 * Start an OAuth issuance flow
 *
 * Body:
 * - providerId: string - The provider ID (e.g., 'digilocker')
 * - oobId: string - Out of band ID from the connection
 * - options: object - Provider-specific options (scope, codeChallenge, etc.)
 */
router.post('/issuance/start', async (req: Request, res: Response) => {
    try {
        const { providerId, oobId, options } = req.body;

        if (!providerId || !oobId) {
            return res.status(400).json({
                success: false,
                message: 'providerId and oobId are required'
            });
        }

        // Check if ESSI agent is initialized
        if (!isESSIAgentInitialized()) {
            return res.status(503).json({
                success: false,
                message: 'ESSI agent not initialized. Service starting up.'
            });
        }

        const agent = await getESSIAgent();
        const service = new InstitutionalIssuanceService(agent);

        const result = await service.startOAuthIssuance(providerId, oobId, options);

        res.json({
            success: true,
            ...result
        });
    } catch (error: any) {
        console.error('[Institutional] Error starting issuance:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to start issuance'
        });
    }
});

/**
 * GET /callback/:providerId
 * OAuth callback handler for providers
 *
 * Query params:
 * - code: string - Authorization code
 * - state: string - State parameter (contains csrf:oobId)
 * - error: string - Error code if authorization failed
 * - error_description: string - Error description
 */
router.get('/callback/:providerId', async (req: Request, res: Response) => {
    const { providerId } = req.params;
    const { code, state, error, error_description, code_verifier } = req.query;

    console.log(`[Institutional] Callback received for ${providerId}:`, {
        hasCode: !!code,
        hasState: !!state,
        error,
        error_description
    });

    // Handle error from provider
    if (error) {
        console.warn(`[Institutional] Provider returned error:`, { error, error_description });
        // Redirect to error page or return error response
        return res.redirect(
            `/issuance/error?provider=${providerId}&error=${encodeURIComponent(error as string)}&message=${encodeURIComponent((error_description as string) || '')}`
        );
    }

    if (!code || !state) {
        return res.status(400).json({
            success: false,
            message: 'Missing code or state parameter'
        });
    }

    try {
        if (!isESSIAgentInitialized()) {
            return res.status(503).json({
                success: false,
                message: 'ESSI agent not initialized'
            });
        }

        const agent = await getESSIAgent();
        const service = new InstitutionalIssuanceService(agent);

        const result = await service.handleOAuthCallback(
            providerId,
            code as string,
            state as string,
            code_verifier as string | undefined
        );

        if (result.success) {
            // Redirect to success page
            res.redirect(
                `/issuance/success?provider=${providerId}&credentialId=${result.credentialExchangeId}&sessionId=${result.sessionId}`
            );
        } else {
            res.redirect(
                `/issuance/error?provider=${providerId}&error=issuance_failed&message=${encodeURIComponent(result.error || 'Unknown error')}&sessionId=${result.sessionId || ''}`
            );
        }
    } catch (error: any) {
        console.error('[Institutional] Callback error:', error);
        res.redirect(
            `/issuance/error?provider=${providerId}&error=server_error&message=${encodeURIComponent(error.message || 'Server error')}`
        );
    }
});

/**
 * POST /callback/:providerId
 * OAuth callback handler (POST variant for some providers)
 */
router.post('/callback/:providerId', async (req: Request, res: Response) => {
    const { providerId } = req.params;
    const code = req.query.code || req.body.code;
    const state = req.query.state || req.body.state;
    const error = req.query.error || req.body.error;
    const error_description = req.query.error_description || req.body.error_description;
    const code_verifier = req.query.code_verifier || req.body.code_verifier;

    console.log(`[Institutional] POST Callback received for ${providerId}`);

    if (error) {
        return res.status(400).json({
            success: false,
            error,
            error_description,
            message: error_description || error
        });
    }

    if (!code || !state) {
        return res.status(400).json({
            success: false,
            message: 'Missing code or state parameter'
        });
    }

    try {
        if (!isESSIAgentInitialized()) {
            return res.status(503).json({
                success: false,
                message: 'ESSI agent not initialized'
            });
        }

        const agent = await getESSIAgent();
        const service = new InstitutionalIssuanceService(agent);

        const result = await service.handleOAuthCallback(
            providerId,
            code as string,
            state as string,
            code_verifier as string | undefined
        );

        res.json({
            success: result.success,
            credentialExchangeId: result.credentialExchangeId,
            sessionId: result.sessionId,
            error: result.error
        });
    } catch (error: any) {
        console.error('[Institutional] POST Callback error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to process callback'
        });
    }
});

/**
 * GET /sessions/:sessionId
 * Get issuance session status
 */
router.get('/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;

        const client = await db.connect();
        try {
            const result = await client.query(
                'SELECT * FROM issuance_sessions WHERE id = $1',
                [sessionId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Session not found'
                });
            }

            const session = result.rows[0];
            // Don't expose sensitive data
            res.json({
                success: true,
                session: {
                    id: session.id,
                    providerId: session.provider_id,
                    credentialType: session.credential_type,
                    status: session.status,
                    credentialExchangeId: session.credential_exchange_id,
                    createdAt: session.created_at,
                    issuedAt: session.issued_at
                }
            });
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('[Institutional] Error fetching session:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch session'
        });
    }
});

/**
 * GET /sessions/oob/:oobId
 * Get all issuance sessions for an out-of-band ID
 */
router.get('/sessions/oob/:oobId', async (req: Request, res: Response) => {
    try {
        const { oobId } = req.params;

        const client = await db.connect();
        try {
            const result = await client.query(
                'SELECT * FROM issuance_sessions WHERE out_of_band_id = $1 ORDER BY created_at DESC',
                [oobId]
            );

            res.json({
                success: true,
                sessions: result.rows.map(session => ({
                    id: session.id,
                    providerId: session.provider_id,
                    credentialType: session.credential_type,
                    status: session.status,
                    credentialExchangeId: session.credential_exchange_id,
                    createdAt: session.created_at,
                    issuedAt: session.issued_at
                }))
            });
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('[Institutional] Error fetching sessions by oobId:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch sessions'
        });
    }
});

/**
 * DELETE /sessions/:sessionId
 * Cancel a pending issuance session
 */
router.delete('/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;

        const client = await db.connect();
        try {
            const result = await client.query(
                `UPDATE issuance_sessions SET status = 'failed'
                WHERE id = $1 AND status = 'pending'
                RETURNING id`,
                [sessionId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Session not found or already processed'
                });
            }

            res.json({
                success: true,
                message: 'Session cancelled'
            });
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('[Institutional] Error cancelling session:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to cancel session'
        });
    }
});

/**
 * GET /status
 * Health check for institutional issuance service
 */
router.get('/status', async (req: Request, res: Response) => {
    try {
        const registry = ProviderRegistry.getInstance();
        const providers = registry.getAllProviders();

        res.json({
            success: true,
            status: {
                essiAgentInitialized: isESSIAgentInitialized(),
                registeredProviders: providers.map(p => ({
                    id: p.providerId,
                    name: p.name,
                    type: p.type,
                    credentialTypes: p.getSupportedCredentialTypes()
                }))
            }
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get status'
        });
    }
});

export default router;
