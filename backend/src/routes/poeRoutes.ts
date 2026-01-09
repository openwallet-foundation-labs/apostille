import { Router, Request, Response } from 'express';
import { getAgent } from '../services/agentService';

const router = Router();

/**
 * Get all POE sessions
 * GET /api/poe/sessions
 */
router.get('/sessions', async (req: Request, res: Response) => {
    try {
        const { tenantId } = (req as any).user;
        const agent = await getAgent({ tenantId });

        const sessions = await agent.modules.poe.getAll();

        res.json({
            success: true,
            sessions: sessions.map((session: any) => ({
                id: session.id,
                sessionId: session.sessionId,
                state: session.state,
                role: session.role,
                connectionId: session.connectionId,
                programId: session.execution?.program_id,
                bindingContext: session.bindingContext,
                verificationResult: session.verificationResult,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
            })),
        });
    } catch (error: any) {
        console.error('Error fetching POE sessions:', error);
        res.status(500).json({
            error: 'Failed to fetch POE sessions',
            message: error.message,
        });
    }
});

/**
 * Get POE session by ID
 * GET /api/poe/sessions/:sessionId
 */
router.get('/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
        const { tenantId } = (req as any).user;
        const { sessionId } = req.params;
        const agent = await getAgent({ tenantId });

        const session = await agent.modules.poe.getById(sessionId);

        if (!session) {
            return res.status(404).json({ error: 'POE session not found' });
        }

        res.json({
            success: true,
            session: {
                id: session.id,
                sessionId: session.sessionId,
                state: session.state,
                role: session.role,
                connectionId: session.connectionId,
                threadId: session.threadId,
                execution: session.execution,
                bindingContext: session.bindingContext,
                proofArtifact: session.proofArtifact,
                verificationResult: session.verificationResult,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
            },
        });
    } catch (error: any) {
        console.error('Error fetching POE session:', error);
        res.status(500).json({
            error: 'Failed to fetch POE session',
            message: error.message,
        });
    }
});

/**
 * Get sessions by connection ID
 * GET /api/poe/connections/:connectionId/sessions
 */
router.get('/connections/:connectionId/sessions', async (req: Request, res: Response) => {
    try {
        const { tenantId } = (req as any).user;
        const { connectionId } = req.params;
        const agent = await getAgent({ tenantId });

        const sessions = await agent.modules.poe.getByConnectionId(connectionId);

        res.json({
            success: true,
            sessions: sessions.map((session: any) => ({
                id: session.id,
                sessionId: session.sessionId,
                state: session.state,
                role: session.role,
                programId: session.execution?.program_id,
                verificationResult: session.verificationResult,
                createdAt: session.createdAt,
            })),
        });
    } catch (error: any) {
        console.error('Error fetching POE sessions by connection:', error);
        res.status(500).json({
            error: 'Failed to fetch POE sessions',
            message: error.message,
        });
    }
});

/**
 * Request proof of execution (Requester role)
 * POST /api/poe/request
 */
router.post('/request', async (req: Request, res: Response) => {
    try {
        const { tenantId } = (req as any).user;
        const { connectionId, programs, expiry, bindingContext } = req.body;

        if (!connectionId) {
            return res.status(400).json({ error: 'connectionId is required' });
        }

        if (!programs || !Array.isArray(programs) || programs.length === 0) {
            return res.status(400).json({ error: 'programs array is required' });
        }

        const agent = await getAgent({ tenantId });

        // Generate binding context if not provided
        const actualBindingContext = bindingContext || {
            nonce: agent.modules.poe.generateNonce(),
            context_hash: '0x' + 'a'.repeat(64),
            session_id: agent.modules.poe.generateSessionId(),
        };

        const session = await agent.modules.poe.requestProofOfExecution(connectionId, {
            programs: programs.map((p: any) => ({
                program_id: p.program_id,
                program_version: p.program_version,
                inputs: p.inputs,
                public_constraints: p.public_constraints,
                disclosure: p.disclosure || 'proof-only',
                policy: p.policy,
            })),
            bindingContext: actualBindingContext,
            expiry: expiry || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });

        res.json({
            success: true,
            session: {
                id: session.id,
                sessionId: session.sessionId,
                state: session.state,
                role: session.role,
                connectionId: session.connectionId,
                bindingContext: session.bindingContext,
            },
        });
    } catch (error: any) {
        console.error('Error requesting proof of execution:', error);
        res.status(500).json({
            error: 'Failed to request proof of execution',
            message: error.message,
        });
    }
});

/**
 * Submit proof of execution (Prover role)
 * POST /api/poe/submit/:sessionId
 */
router.post('/submit/:sessionId', async (req: Request, res: Response) => {
    try {
        const { tenantId } = (req as any).user;
        const { sessionId } = req.params;
        const { proofArtifact } = req.body;

        if (!proofArtifact) {
            return res.status(400).json({ error: 'proofArtifact is required' });
        }

        const agent = await getAgent({ tenantId });

        const session = await agent.modules.poe.submitProof(sessionId, proofArtifact);

        res.json({
            success: true,
            session: {
                id: session.id,
                sessionId: session.sessionId,
                state: session.state,
                role: session.role,
            },
        });
    } catch (error: any) {
        console.error('Error submitting proof:', error);
        res.status(500).json({
            error: 'Failed to submit proof',
            message: error.message,
        });
    }
});

/**
 * Propose alternative execution (Prover - negotiation)
 * POST /api/poe/propose/:sessionId
 */
router.post('/propose/:sessionId', async (req: Request, res: Response) => {
    try {
        const { tenantId } = (req as any).user;
        const { sessionId } = req.params;
        const { programs, reason } = req.body;

        const agent = await getAgent({ tenantId });

        const session = await agent.modules.poe.proposeAlternative(sessionId, {
            programs,
            reason,
        });

        res.json({
            success: true,
            session: {
                id: session.id,
                sessionId: session.sessionId,
                state: session.state,
                role: session.role,
            },
        });
    } catch (error: any) {
        console.error('Error proposing alternative:', error);
        res.status(500).json({
            error: 'Failed to propose alternative',
            message: error.message,
        });
    }
});

/**
 * Accept proposal (Requester - negotiation)
 * POST /api/poe/accept/:sessionId
 */
router.post('/accept/:sessionId', async (req: Request, res: Response) => {
    try {
        const { tenantId } = (req as any).user;
        const { sessionId } = req.params;

        const agent = await getAgent({ tenantId });

        const session = await agent.modules.poe.acceptProposal(sessionId);

        res.json({
            success: true,
            session: {
                id: session.id,
                sessionId: session.sessionId,
                state: session.state,
                role: session.role,
            },
        });
    } catch (error: any) {
        console.error('Error accepting proposal:', error);
        res.status(500).json({
            error: 'Failed to accept proposal',
            message: error.message,
        });
    }
});

/**
 * Decline proposal (Requester - negotiation)
 * POST /api/poe/decline/:sessionId
 */
router.post('/decline/:sessionId', async (req: Request, res: Response) => {
    try {
        const { tenantId } = (req as any).user;
        const { sessionId } = req.params;
        const { reason } = req.body;

        const agent = await getAgent({ tenantId });

        const session = await agent.modules.poe.declineProposal(sessionId, reason);

        res.json({
            success: true,
            session: {
                id: session.id,
                sessionId: session.sessionId,
                state: session.state,
                role: session.role,
            },
        });
    } catch (error: any) {
        console.error('Error declining proposal:', error);
        res.status(500).json({
            error: 'Failed to decline proposal',
            message: error.message,
        });
    }
});

/**
 * Complete protocol
 * POST /api/poe/complete/:sessionId
 */
router.post('/complete/:sessionId', async (req: Request, res: Response) => {
    try {
        const { tenantId } = (req as any).user;
        const { sessionId } = req.params;
        const { issueReceipt } = req.body;

        const agent = await getAgent({ tenantId });

        const session = await agent.modules.poe.complete(sessionId, issueReceipt);

        res.json({
            success: true,
            session: {
                id: session.id,
                sessionId: session.sessionId,
                state: session.state,
                role: session.role,
                verificationResult: session.verificationResult,
            },
        });
    } catch (error: any) {
        console.error('Error completing POE session:', error);
        res.status(500).json({
            error: 'Failed to complete POE session',
            message: error.message,
        });
    }
});

/**
 * Send problem report
 * POST /api/poe/problem-report/:sessionId
 */
router.post('/problem-report/:sessionId', async (req: Request, res: Response) => {
    try {
        const { tenantId } = (req as any).user;
        const { sessionId } = req.params;
        const { code, explain, details } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'code is required' });
        }

        const agent = await getAgent({ tenantId });

        const session = await agent.modules.poe.sendProblemReport(sessionId, code, explain, details);

        res.json({
            success: true,
            session: {
                id: session.id,
                sessionId: session.sessionId,
                state: session.state,
            },
        });
    } catch (error: any) {
        console.error('Error sending problem report:', error);
        res.status(500).json({
            error: 'Failed to send problem report',
            message: error.message,
        });
    }
});

/**
 * Get registered programs
 * GET /api/poe/programs
 */
router.get('/programs', async (req: Request, res: Response) => {
    try {
        const { tenantId } = (req as any).user;
        const agent = await getAgent({ tenantId });

        const programs = agent.modules.poe.getAllPrograms();

        res.json({
            success: true,
            programs: programs.map((p: any) => ({
                program_id: p.program_id,
                version: p.version,
                name: p.name,
                description: p.description,
                allowed_vk_hashes: p.allowed_vk_hashes,
                public_schema: p.public_schema,
                supports_interactive: p.supports_interactive,
            })),
        });
    } catch (error: any) {
        console.error('Error fetching programs:', error);
        res.status(500).json({
            error: 'Failed to fetch programs',
            message: error.message,
        });
    }
});

/**
 * Get registered proof systems
 * GET /api/poe/proof-systems
 */
router.get('/proof-systems', async (req: Request, res: Response) => {
    try {
        const { tenantId } = (req as any).user;
        const agent = await getAgent({ tenantId });

        const systems = agent.modules.poe.getAllProofSystems();

        res.json({
            success: true,
            proofSystems: systems.map((s: any) => ({
                id: s.id,
                name: s.name,
                version: s.version,
            })),
        });
    } catch (error: any) {
        console.error('Error fetching proof systems:', error);
        res.status(500).json({
            error: 'Failed to fetch proof systems',
            message: error.message,
        });
    }
});

/**
 * Generate nonce (utility endpoint)
 * GET /api/poe/generate-nonce
 */
router.get('/generate-nonce', async (req: Request, res: Response) => {
    try {
        const { tenantId } = (req as any).user;
        const agent = await getAgent({ tenantId });

        const nonce = agent.modules.poe.generateNonce();
        const sessionId = agent.modules.poe.generateSessionId();

        res.json({
            success: true,
            nonce,
            sessionId,
        });
    } catch (error: any) {
        console.error('Error generating nonce:', error);
        res.status(500).json({
            error: 'Failed to generate nonce',
            message: error.message,
        });
    }
});

export default router;
