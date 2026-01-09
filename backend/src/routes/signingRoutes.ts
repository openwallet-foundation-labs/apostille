import { Router, Request, Response } from 'express';
import { getAgent } from '../services/agentService';
import { KeyType } from '@credo-ts/core';
import crypto from 'crypto';

const router = Router();

// Helper function to compute SHA-256 digest
function computeSha256Digest(data: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(data);
  return hash.digest('base64');
}

/**
 * Request signing from a connection
 * POST /api/signing/request
 */
router.post('/request', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { connectionId, document, label } = req.body;

    if (!connectionId) {
      return res.status(400).json({ error: 'connectionId is required' });
    }

    if (!document) {
      return res.status(400).json({ error: 'document is required' });
    }

    const agent = await getAgent({ tenantId });

    // Canonicalize document (convert to string)
    const documentString = typeof document === 'string'
      ? document
      : JSON.stringify(document);

    // Compute digest
    const digestValue = computeSha256Digest(documentString);

    // Generate unique object ID
    const objectId = `obj-${crypto.randomUUID()}`;

    // Request signing
    const session = await agent.modules.signing.requestSigning(connectionId, {
      object: {
        id: objectId,
        data: documentString,  // Extra field for runtime - not in TypeScript interface but tests use it
        mediaType: 'application/json',
        canonicalization: {
          method: 'raw-bytes@1',  // The module expects 'method', not 'canonicalizer'
          parameters: {
            data: documentString,  // Provide data in parameters as well
          },
        },
        digest: {
          alg: 'sha-256',
          value: digestValue,
        },
      },
      suite: {
        suite: 'jws-ed25519@1',
      },
      // Don't pass session - let the module generate sessionId automatically
      // If we need a label, we'll add it in a future update
    });

    res.json({
      success: true,
      session: {
        id: session.id,
        sessionId: session.sessionId,
        state: session.state,
        role: session.role,
        connectionId: session.connectionId,
        object: session.object,
      },
    });
  } catch (error: any) {
    console.error('Error requesting signing:', error);
    res.status(500).json({
      error: 'Failed to request signing',
      message: error.message
    });
  }
});

/**
 * Consent to sign a document
 * POST /api/signing/consent/:sessionId
 */
router.post('/consent/:sessionId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { sessionId } = req.params;
    const { objectId, keyId } = req.body;

    const agent = await getAgent({ tenantId });

    // Get session to extract objectId if not provided
    const sessionRecord = await agent.modules.signing.getById(sessionId);
    if (!sessionRecord) {
      return res.status(404).json({ error: 'Signing session not found' });
    }

    const actualObjectId = objectId || sessionRecord.object?.id;
    if (!actualObjectId) {
      return res.status(400).json({ error: 'objectId is required' });
    }

    // Use provided keyId or auto-generate from tenant's DID
    let actualKeyId = keyId;

    if (!actualKeyId) {
      // Get the first DID for this tenant to use as signing key
      try {
        const dids = await agent.dids.getCreatedDids();
        if (dids.length > 0) {
          const did = dids[0];
          const didDocument = did.didDocument;
          const didString = did.did;

          // Get authentication or verificationMethod key reference
          if (didDocument?.authentication && didDocument.authentication.length > 0) {
            // Authentication references can be strings (key IDs) or objects
            const authRef = didDocument.authentication[0];
            let keyId = typeof authRef === 'string' ? authRef : authRef.id;
            // Resolve relative references like #key-1 to absolute ones
            actualKeyId = keyId.startsWith('#') ? `${didString}${keyId}` : keyId;
          } else if (didDocument?.verificationMethod && didDocument.verificationMethod.length > 0) {
            let keyId = didDocument.verificationMethod[0].id;
            // Resolve relative references like #key-1 to absolute ones
            actualKeyId = keyId.startsWith('#') ? `${didString}${keyId}` : keyId;
          }
        }
      } catch (error) {
        console.error('Failed to get DIDs for signing:', error);
      }

      if (!actualKeyId) {
        return res.status(400).json({
          error: 'No signing key available. Please create a DID first or provide keyId.'
        });
      }
    }

    console.log(`Consenting to sign with keyId: ${actualKeyId}`);

    const updatedSession = await agent.modules.signing.consentToSign(sessionId, {
      objectId: actualObjectId,
      keyId: actualKeyId,
    });

    res.json({
      success: true,
      session: {
        id: updatedSession.id,
        sessionId: updatedSession.sessionId,
        state: updatedSession.state,
        role: updatedSession.role,
      },
    });
  } catch (error: any) {
    console.error('Error consenting to sign:', error);
    res.status(500).json({
      error: 'Failed to consent to signing',
      message: error.message
    });
  }
});

/**
 * Sign a document (create signature)
 * POST /api/signing/sign/:sessionId
 */
router.post('/sign/:sessionId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { sessionId } = req.params;
    const { objectId, keyId } = req.body;

    const agent = await getAgent({ tenantId });

    // Get session to extract objectId if not provided
    const sessionRecord = await agent.modules.signing.getById(sessionId);
    if (!sessionRecord) {
      return res.status(404).json({ error: 'Signing session not found' });
    }

    const actualObjectId = objectId || sessionRecord.object?.id;
    if (!actualObjectId) {
      return res.status(400).json({ error: 'objectId is required' });
    }

    // Use provided keyId or get from consent message
    let actualKeyId = keyId;
    if (!actualKeyId && sessionRecord.consentMessages && sessionRecord.consentMessages.length > 0) {
      actualKeyId = sessionRecord.consentMessages[0].keyId;
    }

    // If still no keyId, try to get from tenant's DID
    if (!actualKeyId) {
      try {
        const dids = await agent.dids.getCreatedDids();
        if (dids.length > 0) {
          const did = dids[0];
          const didDocument = did.didDocument;
          const didString = did.did;

          // Get authentication or verificationMethod key reference
          if (didDocument?.authentication && didDocument.authentication.length > 0) {
            // Authentication references can be strings (key IDs) or objects
            const authRef = didDocument.authentication[0];
            let keyId = typeof authRef === 'string' ? authRef : authRef.id;
            // Resolve relative references like #key-1 to absolute ones
            actualKeyId = keyId.startsWith('#') ? `${didString}${keyId}` : keyId;
          } else if (didDocument?.verificationMethod && didDocument.verificationMethod.length > 0) {
            let keyId = didDocument.verificationMethod[0].id;
            // Resolve relative references like #key-1 to absolute ones
            actualKeyId = keyId.startsWith('#') ? `${didString}${keyId}` : keyId;
          }
        }
      } catch (error) {
        console.error('Failed to get DIDs for signing:', error);
      }
    }

    if (!actualKeyId) {
      return res.status(400).json({
        error: 'No signing key available. Please consent first or create a DID.'
      });
    }

    console.log(`Signing with keyId: ${actualKeyId}, objectId: ${actualObjectId}, sessionId: ${sessionId}`);

    const updatedSession = await agent.modules.signing.sign(sessionId, {
      objectId: actualObjectId,
      keyId: actualKeyId,
    });

    res.json({
      success: true,
      session: {
        id: updatedSession.id,
        sessionId: updatedSession.sessionId,
        state: updatedSession.state,
        role: updatedSession.role,
        partialSignatures: updatedSession.partialSignatures,
      },
    });
  } catch (error: any) {
    console.error('Error creating signature:', error);
    res.status(500).json({
      error: 'Failed to create signature',
      message: error.message
    });
  }
});

/**
 * Complete signing session and provide final artifacts
 * POST /api/signing/complete/:sessionId
 */
router.post('/complete/:sessionId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { sessionId } = req.params;

    const agent = await getAgent({ tenantId });

    const updatedSession = await agent.modules.signing.provideFinalArtifacts(sessionId);

    res.json({
      success: true,
      session: {
        id: updatedSession.id,
        sessionId: updatedSession.sessionId,
        state: updatedSession.state,
        role: updatedSession.role,
        partialSignatures: updatedSession.partialSignatures,
      },
    });
  } catch (error: any) {
    console.error('Error completing signing session:', error);
    res.status(500).json({
      error: 'Failed to complete signing session',
      message: error.message
    });
  }
});

/**
 * Decline a signing request
 * POST /api/signing/decline/:sessionId
 */
router.post('/decline/:sessionId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { sessionId } = req.params;
    const { reason } = req.body;

    const agent = await getAgent({ tenantId });

    const updatedSession = await agent.modules.signing.decline(
      sessionId,
      reason || 'Declined by user'
    );

    res.json({
      success: true,
      session: {
        id: updatedSession.id,
        sessionId: updatedSession.sessionId,
        state: updatedSession.state,
        role: updatedSession.role,
      },
    });
  } catch (error: any) {
    console.error('Error declining signing request:', error);
    res.status(500).json({
      error: 'Failed to decline signing request',
      message: error.message
    });
  }
});

/**
 * Get available signing keys (standalone wallet keys for signing)
 * GET /api/signing/keys
 */
router.get('/keys', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const agent = await getAgent({ tenantId });

    console.log('Fetching signing keys for tenant:', tenantId);

    // Query using tags - generic records use tags for categorization
    const signingKeysMetadata = await agent.genericRecords.findAllByQuery({
      type: 'SigningKey',
    });

    console.log('Found', signingKeysMetadata.length, 'signing key records');

    const keys = signingKeysMetadata.map((record: any) => {
      console.log('Record:', {
        id: record.id,
        content: record.content,
        createdAt: record.createdAt,
      });
      return {
        fingerprint: record.content.fingerprint,
        keyType: record.content.keyType || 'Ed25519',
        createdAt: record.createdAt,
      };
    });

    console.log('Returning keys:', keys);

    res.json({
      success: true,
      keys,
    });
  } catch (error: any) {
    console.error('Error fetching signing keys:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to fetch signing keys',
      message: error.message
    });
  }
});

/**
 * Create a new signing key
 * POST /api/signing/keys
 */
router.post('/keys', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const agent = await getAgent({ tenantId });

    console.log('Creating signing key for tenant:', tenantId);

    // Create a new Ed25519 key in the wallet
    const key = await agent.wallet.createKey({ keyType: KeyType.Ed25519 });
    console.log('Key created with fingerprint:', key.fingerprint);

    // Store the key fingerprint in metadata using tags
    const record = await agent.genericRecords.save({
      content: {
        fingerprint: key.fingerprint,
        keyType: key.keyType,
      },
      tags: {
        type: 'SigningKey',
        fingerprint: key.fingerprint,
      },
    });
    console.log('Record saved with ID:', record.id, 'tags:', record.getTags());

    res.json({
      success: true,
      key: {
        fingerprint: key.fingerprint,
        keyType: key.keyType,
        createdAt: record.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Error creating signing key:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to create signing key',
      message: error.message
    });
  }
});

/**
 * Get all signing sessions
 * GET /api/signing/sessions
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const agent = await getAgent({ tenantId });

    const sessions = await agent.modules.signing.getAll();

    res.json({
      success: true,
      sessions: sessions.map((session: any) => ({
        id: session.id,
        sessionId: session.sessionId,
        state: session.state,
        role: session.role,
        connectionId: session.connectionId,
        object: session.object,
        partialSignatures: session.partialSignatures,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching signing sessions:', error);
    res.status(500).json({
      error: 'Failed to fetch signing sessions',
      message: error.message
    });
  }
});

/**
 * Get a specific signing session
 * GET /api/signing/sessions/:sessionId
 */
router.get('/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { sessionId } = req.params;
    const agent = await getAgent({ tenantId });

    const session = await agent.modules.signing.getById(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Signing session not found' });
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
        object: session.object,
        suite: session.suite,
        partialSignatures: session.partialSignatures,
        consentMessages: session.consentMessages,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('Error fetching signing session:', error);
    res.status(500).json({
      error: 'Failed to fetch signing session',
      message: error.message
    });
  }
});

export default router;
