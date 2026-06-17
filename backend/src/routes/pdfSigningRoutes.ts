import { Router, Request, Response } from 'express';
import { getAgent } from '../services/agentService';
import { PdfUtils, SignaturePlaceholderOptions } from '@ajna-inc/signing';
import { VaultRepository, VaultRecord, VaultEncryptionService, generateUuid, toBase64Url } from '@ajna-inc/vaults';
import multer from 'multer';
import * as crypto from 'crypto';

const router = Router();

const updateSigningVaultMetadata = async (
  agent: any,
  vaultId: string,
  updates: Record<string, unknown>
) => {
  try {
    const vaultRepo = agent.context?.dependencyManager?.resolve?.(VaultRepository);
    if (!vaultRepo) return;
    const record = await vaultRepo.findByVaultId(agent.context, vaultId);
    if (!record) return;

    record.header.metadata = {
      ...(record.header.metadata || {}),
      ...updates,
    };
    record.updatedAt = new Date();
    await vaultRepo.update(agent.context, record);
  } catch (error: any) {
    console.warn('[PDF-Signing] Failed to update vault metadata', error?.message || error);
  }
};

const createSignerLocalCopy = async (
  agent: any,
  signedPdf: Uint8Array,
  originalMetadata: Record<string, any>,
  signerConnectionId: string,
  originalVaultId: string
) => {
  try {
    const keypair = await agent.modules.vaults.getLocalKeypair(signerConnectionId);
    if (!keypair) return;

    const encryptionService = agent.context?.dependencyManager?.resolve?.(VaultEncryptionService);
    const vaultRepo = agent.context?.dependencyManager?.resolve?.(VaultRepository);
    if (!encryptionService || !vaultRepo) return;

    const recipient = {
      kid: keypair.kid,
      publicKey: keypair.publicKey,
    };

    const docId = generateUuid();
    const vaultId = generateUuid();

    const vault = await encryptionService.encryptAnyOf(signedPdf, [recipient], { docId, vaultId });
    vault.header.metadata = {
      ...originalMetadata,
      originalVaultId,
      signerConnectionId,
      role: 'signer',
      isSigned: true,
      signedAt: originalMetadata?.signedAt ?? new Date().toISOString(),
      purpose: 'signer-copy',
      signerLocalCopy: true,
      createdAt: new Date().toISOString(),
    };

    const record = new VaultRecord({
      vaultId,
      docId,
      header: vault.header,
      ciphertext: toBase64Url(vault.ciphertext),
      ownerDid: agent.context?.contextCorrelationId,
    });
    await vaultRepo.save(agent.context, record);
  } catch (error: any) {
    console.warn('[PDF-Signing] Failed to create signer local copy:', error?.message || error);
  }
};

const sendOwnerAckToSigner = async (
  agent: any,
  vaultMeta: Record<string, any> | undefined,
  vaultId: string,
  action: 'verified' | 'downloaded'
) => {
  try {
    if (!vaultMeta?.receivedFrom || (!vaultMeta?.isSigned && vaultMeta?.role !== 'signer')) return;

    // Prefer the connection this vault was received from (signer)
    const candidateIds = [
      vaultMeta?.receivedFrom,
      vaultMeta?.signerConnectionId,
    ].filter((v: any) => typeof v === 'string' && v.length > 0) as string[];

    if (candidateIds.length === 0) return;

    const payload = {
      type: 'pdf-signing-owner-ack',
      originalVaultId: vaultMeta?.originalVaultId,
      signedVaultId: vaultId,
      action,
      at: new Date().toISOString(),
    };

    let lastErr: any = null;
    for (const connectionId of candidateIds) {
      try {
        await agent.didcomm.basicMessages.sendMessage(connectionId, JSON.stringify(payload));
        return;
      } catch (err: any) {
        lastErr = err;
      }
    }

    if (lastErr) {
      console.warn('[PDF-Signing] Failed to send owner ack to signer:', lastErr?.message || lastErr);
    }
  } catch (error: any) {
    console.warn('[PDF-Signing] Failed to send owner ack to signer:', error?.message || error);
  }
};

// In-memory dedup: prevent concurrent duplicate vault creation for the same session
const inFlightVaultCreations = new Set<string>();

/**
 * Auto-create an encrypted vault for a wallet-originated signing session.
 * This makes the PDF appear in the Vaults section so the user can access it normally.
 * The vault metadata carries isSessionBased + sessionId so the frontend still routes
 * getSessionPdf / signSession calls through the session protocol instead of the vault
 * download/upload paths.
 */
const autoCreateVaultForSession = async (
  agent: any,
  session: any,
  payload: { pdfBase64: string; fields?: any[]; title?: string }
): Promise<void> => {
  const vaultRepo = agent.context?.dependencyManager?.resolve?.(VaultRepository);
  const encryptionService = agent.context?.dependencyManager?.resolve?.(VaultEncryptionService);
  if (!vaultRepo || !encryptionService) return;

  // Get or generate a local KEM keypair so we can decrypt the vault ourselves
  let keypair = await agent.modules.vaults.getLocalKeypair(session.connectionId);
  if (!keypair) {
    keypair = agent.modules.vaults.generateKemKeypair();
    await agent.modules.vaults.storeLocalKeypair(session.connectionId, keypair);
  }

  const pdfBytes = new Uint8Array(Buffer.from(payload.pdfBase64, 'base64'));
  const docId = generateUuid();
  const vaultId = generateUuid();

  const vault = await encryptionService.encryptAnyOf(
    pdfBytes,
    [{ kid: keypair.kid, publicKey: keypair.publicKey }],
    { docId, vaultId }
  );

  vault.header.metadata = {
    filename: payload.title || session.object?.displayHints?.title || 'Signing Request',
    description: session.object?.displayHints?.summary,
    mimeType: 'application/pdf',
    isSessionBased: true,
    sessionId: session.id,
    receivedFrom: session.connectionId,
    signerConnectionId: session.connectionId,
    createdAt: new Date().toISOString(),
    ...(payload.fields?.length ? { signingFields: payload.fields } : {}),
  };

  const record = new VaultRecord({
    vaultId,
    docId,
    header: vault.header,
    ciphertext: toBase64Url(vault.ciphertext),
    ownerDid: agent.context?.contextCorrelationId,
  });
  await vaultRepo.save(agent.context, record);
  console.log(`[PDF-Signing] Auto-created vault ${vaultId} for session ${session.id}`);
};

const sendPdfSigningNotice = async (
  agent: any,
  connectionId: string,
  payload: Record<string, unknown>
) => {
  try {
    if (!connectionId) return;
    await agent.didcomm.basicMessages.sendMessage(connectionId, JSON.stringify(payload));
  } catch (error: any) {
    console.warn('[PDF-Signing] Failed to send notice:', error?.message || error);
  }
};

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max for PDFs
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

/**
 * Upload a PDF and create encrypted vaults for signing
 * POST /api/pdf-signing/upload
 * Body: multipart/form-data with 'file' and either:
 *   - 'recipientConnectionId' (single recipient, backward compat)
 *   - 'recipientConnectionIds' (JSON array of connection IDs)
 *   - 'threshold' (number, how many signatures required; defaults to all)
 *
 * Uses ML-KEM-768 encryption to each recipient's public key.
 * All parties must have exchanged KEM keys before uploading.
 */
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { recipientConnectionId, recipientConnectionIds: recipientIdsJson, description, signingFields: signingFieldsJson, threshold: thresholdStr } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'PDF file is required' });
    }

    // Parse recipient connection IDs — support both single (backward compat) and array
    let recipientConnectionIds: string[] = [];
    if (recipientIdsJson) {
      try {
        recipientConnectionIds = JSON.parse(recipientIdsJson);
      } catch {
        return res.status(400).json({ error: 'Invalid recipientConnectionIds format' });
      }
    } else if (recipientConnectionId) {
      recipientConnectionIds = [recipientConnectionId];
    }

    if (recipientConnectionIds.length === 0) {
      return res.status(400).json({
        error: 'At least one recipient is required',
        message: 'Please select a connection to send the PDF to'
      });
    }

    // Parse threshold (default = all must sign)
    const threshold = thresholdStr ? parseInt(thresholdStr, 10) : recipientConnectionIds.length;
    if (threshold < 1 || threshold > recipientConnectionIds.length) {
      return res.status(400).json({
        error: 'Invalid threshold',
        message: `Threshold must be between 1 and ${recipientConnectionIds.length}`
      });
    }

    const agent = await getAgent({ tenantId });

    // Validate all connections exist and have KEM keys
    for (const connId of recipientConnectionIds) {
      const connection = await agent.didcomm.connections.findById(connId);
      if (!connection) {
        return res.status(404).json({
          error: 'Connection not found',
          message: `Connection ${connId} does not exist`
        });
      }
      const hasPeerKey = await agent.modules.vaults.hasPeerKemKey(connId);
      if (!hasPeerKey) {
        return res.status(400).json({
          error: 'Key exchange required',
          message: `Please exchange encryption keys with connection ${connection.theirLabel || connId} first`
        });
      }
    }

    const pdfBytes = new Uint8Array(file.buffer);

    // Parse signing fields if provided
    let signingFields: any[] = [];
    if (signingFieldsJson) {
      try {
        signingFields = JSON.parse(signingFieldsJson);
      } catch {
        // Ignore parse errors
      }
    }

    // Generate a group ID to link all vaults for multi-recipient signing
    const signingGroupId = recipientConnectionIds.length > 1 ? crypto.randomUUID() : undefined;
    const isMultiRecipient = recipientConnectionIds.length > 1;
    const pdfDigest = crypto.createHash('sha256').update(pdfBytes).digest('base64url');

    // Create a vault for each recipient
    const vaultResults: { vaultId: string; docId: string; recipientConnectionId: string; signingSessionId?: string }[] = [];

    for (let i = 0; i < recipientConnectionIds.length; i++) {
      const connId = recipientConnectionIds[i];

      // Create a signing vault encrypted to this recipient's KEM key
      const result = await agent.modules.vaults.createSigningVault({
        document: pdfBytes,
        signerConnectionId: connId,
        documentType: 'pdf',
        metadata: {
          filename: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          description: description || 'PDF for signing',
          role: 'owner',
          signerConnectionId: connId,
          allowSignerCopy: true,
          createdAt: new Date().toISOString(),
          ...(signingFields.length > 0 ? { signingFields } : {}),
          // Multi-recipient metadata
          ...(isMultiRecipient ? {
            signingGroupId,
            threshold,
            totalSigners: recipientConnectionIds.length,
            signerIndex: i,
          } : {}),
        },
      });

      console.log(`[PDF-Signing] Created vault ${result.vaultId} for connection ${connId}${signingGroupId ? ` (group ${signingGroupId})` : ''}`);

      // Auto-share the vault with the recipient
      try {
        await agent.modules.vaults.shareSigningVault(result.vaultId, connId);
        console.log(`[PDF-Signing] Auto-shared vault ${result.vaultId} with connection ${connId}`);
        await sendPdfSigningNotice(agent, connId, {
          type: 'pdf-signing-shared',
          vaultId: result.vaultId,
          ...(signingGroupId ? { signingGroupId } : {}),
          at: new Date().toISOString(),
        });
      } catch (shareError: any) {
        console.error(`[PDF-Signing] Failed to auto-share vault ${result.vaultId}:`, shareError.message);
      }

      // Create a signing session using the DIDComm Signing Protocol
      let signingSessionId: string | undefined;
      try {
        // Embed the PDF + fields in previewLinks so ESSI (wallet) can decode the
        // signing request payload without needing vault access (mirrors vaultBridge.requestSigning).
        const requestPayloadB64 = Buffer.from(
          JSON.stringify({ pdfBase64: Buffer.from(pdfBytes).toString('base64'), fields: signingFields, title: file.originalname })
        ).toString('base64');
        const previewLink = `data:application/json;base64,${requestPayloadB64}`;

        const sessionConfig: any = {
          object: {
            id: result.vaultId,
            mediaType: 'application/pdf',
            canonicalization: { method: 'raw-bytes@1', parameters: {} },
            digest: { alg: 'sha-256', value: pdfDigest },
            displayHints: { title: file.originalname, previewLinks: [previewLink] },
            previewLinks: [previewLink],
          },
          suite: {
            suite: 'pades-b-lta@1',
            keyBinding: { controller: 'self', proofPurpose: 'assertionMethod' }
          },
        };

        // Add threshold config for multi-recipient sessions
        if (isMultiRecipient) {
          sessionConfig.session = {
            sessionId: signingGroupId,
            mode: 'threshold',
            threshold: {
              scheme: 'n-of-m',
              n: threshold,
              m: recipientConnectionIds.length,
              signers: [],
              aggregation: 'none',
            },
          };
        }

        const signingSession = await agent.modules.signing.requestSigning(connId, sessionConfig);
        signingSessionId = signingSession.id;
        console.log(`[PDF-Signing] Created signing session ${signingSession.id} for vault ${result.vaultId}`);
      } catch (signingError: any) {
        console.error(`[PDF-Signing] Failed to create signing session:`, signingError.message);
      }

      vaultResults.push({
        vaultId: result.vaultId,
        docId: result.docId,
        recipientConnectionId: connId,
        signingSessionId,
      });
    }

    // Response: backward-compatible for single recipient, enhanced for multi
    if (recipientConnectionIds.length === 1) {
      const v = vaultResults[0];
      res.json({
        success: true,
        vault: {
          vaultId: v.vaultId,
          docId: v.docId,
          filename: file.originalname,
          size: file.size,
          recipientConnectionId: recipientConnectionIds[0],
          signingSessionId: v.signingSessionId,
        },
      });
    } else {
      res.json({
        success: true,
        signingGroupId,
        threshold,
        totalSigners: recipientConnectionIds.length,
        vaults: vaultResults.map(v => ({
          vaultId: v.vaultId,
          docId: v.docId,
          filename: file.originalname,
          recipientConnectionId: v.recipientConnectionId,
          signingSessionId: v.signingSessionId,
        })),
      });
    }
  } catch (error: any) {
    console.error('Error uploading PDF:', error);
    if (error.message?.includes('No ML-KEM key found')) {
      return res.status(400).json({
        error: 'Key exchange required',
        message: 'Please exchange encryption keys with this connection first'
      });
    }
    res.status(500).json({
      error: 'Failed to upload PDF',
      message: error.message,
    });
  }
});

/**
 * Sign a PDF stored in a vault
 * POST /api/pdf-signing/sign/:vaultId
 * Body: { certificate, privateKey, reason?, location?, name? }
 *
 * Uses KEM keys for decryption - 
 */
router.post('/sign/:vaultId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { vaultId } = req.params;
    const { certificate, privateKey, reason, location, name, contactInfo } = req.body;

    if (!certificate || !privateKey) {
      return res.status(400).json({ error: 'Certificate and private key are required for signing' });
    }

    // Validate PEM format and size
    const MAX_PEM_SIZE = 64 * 1024; // 64KB
    if (typeof certificate !== 'string' || typeof privateKey !== 'string') {
      return res.status(400).json({ error: 'Certificate and private key must be strings' });
    }
    if (certificate.length > MAX_PEM_SIZE || privateKey.length > MAX_PEM_SIZE) {
      return res.status(400).json({ error: 'Certificate or private key exceeds maximum size (64KB)' });
    }
    if (!certificate.includes('-----BEGIN CERTIFICATE-----')) {
      return res.status(400).json({ error: 'Invalid certificate format - expected PEM-encoded certificate' });
    }
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') && !privateKey.includes('-----BEGIN RSA PRIVATE KEY-----') && !privateKey.includes('-----BEGIN EC PRIVATE KEY-----')) {
      return res.status(400).json({ error: 'Invalid private key format - expected PEM-encoded private key' });
    }

    const agent = await getAgent({ tenantId });

    // Resolve KEM key for decryption
    const kemKey = await agent.modules.vaults.resolveVaultDecryptionKey(vaultId);
    if (!kemKey) {
      return res.status(400).json({
        error: 'KEM key not found',
        message: 'No encryption key found that can decrypt this vault. Please exchange keys first.',
      });
    }
    const { secretKey: signSecretKey, kid: signKid, connectionId: signConnectionId } = kemKey;

    // Get the vault record
    const vaultRecord = await agent.modules.vaults.getRecord(vaultId);
    if (!vaultRecord) {
      return res.status(404).json({ error: 'Vault record not found' });
    }

    // Decrypt using KEM keys
    console.log(`[PDF-Signing] Opening signing vault ${vaultId} with KEM key ${signKid}`);
    const { document: pdfBytes } = await agent.modules.vaults.openSigningVault(
      vaultRecord,
      signSecretKey,
      signKid
    );

    // Prepare signature options
    const placeholderOptions: SignaturePlaceholderOptions = {
      reason,
      location,
      name,
      contactInfo,
    };

    // Sign the PDF using PdfUtils
    const signedPdf = await PdfUtils.signPdf(
      pdfBytes,
      { certificate, privateKey, hashAlgorithm: 'sha256' },
      placeholderOptions
    );

    // Strip transport-level metadata from original vault before spreading
    const { receivedFrom: _rf, receivedAt: _ra, lastReceivedFrom: _lrf, lastReceivedAt: _lra, ...originalMetadata } =
      (vaultRecord.header?.metadata || {}) as Record<string, unknown>;

    // Create a new signing vault with the signed PDF (encrypted to owner)
    // For now, store locally - the signer can use "Return to Owner" to send back
    const signedVault = await agent.modules.vaults.createSigningVault({
      document: signedPdf,
      signerConnectionId: signConnectionId, // Will encrypt to owner's key
      documentType: 'pdf',
      metadata: {
        ...originalMetadata,
        originalVaultId: vaultId,
        signedAt: new Date().toISOString(),
        signerName: name,
        signatureReason: reason,
        isSigned: true,
        returnedAt: new Date().toISOString(),
        role: 'signer', // Mark as signer's vault
      },
    });

    console.log(`[PDF-Signing] Created signed vault ${signedVault.vaultId}`);

    await createSignerLocalCopy(agent, signedPdf, originalMetadata as any, signConnectionId, vaultId);

    // Share the signed vault back to the owner
    try {
      await agent.modules.vaults.shareSigningVault(signedVault.vaultId, signConnectionId);
      console.log(`[PDF-Signing] Shared signed vault ${signedVault.vaultId} back to owner via connection ${signConnectionId}`);
      await sendPdfSigningNotice(agent, signConnectionId, {
        type: 'pdf-signing-signed-returned',
        originalVaultId: vaultId,
        signedVaultId: signedVault.vaultId,
        at: new Date().toISOString(),
      });
    } catch (shareError: any) {
      console.error(`[PDF-Signing] Failed to share signed vault back to owner:`, shareError.message);
      // Don't fail the request - vault is created, sharing can be retried
    }

    res.json({
      success: true,
      signedVault: {
        vaultId: signedVault.vaultId,
        docId: signedVault.docId,
        originalVaultId: vaultId,
        signedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error signing PDF:', error);
    if (error.message?.includes('decrypt') || error.message?.includes('KEM') || error.message?.includes('key')) {
      return res.status(401).json({
        error: 'Decryption failed',
        message: 'Cannot decrypt vault - key mismatch or corrupted data',
      });
    }
    res.status(500).json({
      error: 'Failed to sign PDF',
      message: error.message,
    });
  }
});

/**
 * Download a PDF from a vault (decrypted)
 * POST /api/pdf-signing/download/:vaultId
 *
 * Uses KEM keys for decryption - 
 */
router.post('/download/:vaultId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { vaultId } = req.params;

    const agent = await getAgent({ tenantId });

    // Resolve KEM key for decryption
    const kemKey = await agent.modules.vaults.resolveVaultDecryptionKey(vaultId);
    if (!kemKey) {
      return res.status(400).json({
        error: 'KEM key not found',
        message: 'No encryption key found that can decrypt this vault. Please exchange keys first.',
      });
    }

    // Get vault info for filename
    const vaultInfo = await agent.modules.vaults.getInfo(vaultId);

    // Get the vault record
    const vaultRecord = await agent.modules.vaults.getRecord(vaultId);
    if (!vaultRecord) {
      return res.status(404).json({ error: 'Vault record not found' });
    }

    // Decrypt using KEM keys
    console.log(`[PDF-Signing] Downloading vault ${vaultId} with KEM key ${kemKey.kid}`);
    const { document: pdfBytes } = await agent.modules.vaults.openSigningVault(
      vaultRecord,
      kemKey.secretKey,
      kemKey.kid
    );

    // Set headers for PDF download
    const filename = vaultInfo.header?.metadata?.filename || 'document.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBytes.length);

    // Track owner access for completed status
    await updateSigningVaultMetadata(agent, vaultId, {
      downloadedAt: new Date().toISOString(),
    });
    await sendOwnerAckToSigner(agent, vaultInfo.header?.metadata, vaultId, 'downloaded');

    // Send the PDF
    res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error('Error downloading PDF:', error);
    if (error.message?.includes('decrypt') || error.message?.includes('KEM') || error.message?.includes('key')) {
      return res.status(401).json({
        error: 'Decryption failed',
        message: 'Cannot decrypt vault - key mismatch or corrupted data',
      });
    }
    if (error.message?.includes('not found')) {
      return res.status(404).json({
        error: 'Vault not found',
        message: error.message,
      });
    }
    res.status(500).json({
      error: 'Failed to download PDF',
      message: error.message,
    });
  }
});

/**
 * Upload an already-signed PDF (client-side signing)
 * POST /api/pdf-signing/upload-signed/:vaultId
 *
 * Receives a PDF that was signed client-side and stores it as a signed vault.
 * The original vault metadata is preserved and signing info is added.
 */
router.post('/upload-signed/:vaultId', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { vaultId } = req.params;
    const { signerName } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Signed PDF file is required' });
    }

    const agent = await getAgent({ tenantId });

    // Get the original vault info to preserve metadata
    const vaultInfo = await agent.modules.vaults.getInfo(vaultId);
    if (!vaultInfo) {
      return res.status(404).json({ error: 'Original vault not found' });
    }

    // Resolve connection ID via KEM key lookup
    const kemKey = await agent.modules.vaults.resolveVaultDecryptionKey(vaultId);
    const uploadConnectionId = kemKey?.connectionId;

    if (!uploadConnectionId) {
      return res.status(400).json({
        error: 'No KEM keys found',
        message: 'Cannot store signed vault - no encryption keys available for this connection',
      });
    }

    const signedPdfBytes = new Uint8Array(file.buffer);
    // Strip transport-level metadata from original vault before spreading
    const { receivedFrom, receivedAt, lastReceivedFrom, lastReceivedAt, ...originalMetadata } =
      (vaultInfo.header?.metadata || {}) as Record<string, unknown>;

    // Create a new signing vault with the signed PDF
    const signedVault = await agent.modules.vaults.createSigningVault({
      document: signedPdfBytes,
      signerConnectionId: uploadConnectionId,
      documentType: 'pdf',
      metadata: {
        ...originalMetadata,
        originalVaultId: vaultId,
        signedAt: new Date().toISOString(),
        signerName: signerName || 'Unknown',
        isSigned: true,
        returnedAt: new Date().toISOString(),
        role: 'signer',
        signedClientSide: true, // Flag to indicate client-side signing
      },
    });

    console.log(`[PDF-Signing] Created client-side signed vault ${signedVault.vaultId} for original ${vaultId}`);

    await createSignerLocalCopy(agent, signedPdfBytes, originalMetadata as any, uploadConnectionId, vaultId);

    // Share the signed vault back to the owner
    try {
      await agent.modules.vaults.shareSigningVault(signedVault.vaultId, uploadConnectionId);
      console.log(`[PDF-Signing] Shared signed vault ${signedVault.vaultId} back to owner via connection ${uploadConnectionId}`);
      await sendPdfSigningNotice(agent, uploadConnectionId, {
        type: 'pdf-signing-signed-returned',
        originalVaultId: vaultId,
        signedVaultId: signedVault.vaultId,
        at: new Date().toISOString(),
      });
    } catch (shareError: any) {
      console.error(`[PDF-Signing] Failed to share signed vault back to owner:`, shareError.message);
      // Don't fail the request - vault is created, sharing can be retried
    }

    // Send PartialSignatureMessage via signing protocol to notify the owner
    // This updates the session state and triggers automatic notification
    try {
      // Find the signing session for the original vault
      const sessions = await agent.modules.signing.findAllByQuery({
        state: 'request-received'  // Sessions waiting for signature
      });

      const session = sessions.find((s: any) => s.object?.id === vaultId);

      if (session) {
        // Send signature message - this notifies the owner!
        await agent.modules.signing.sign(session.id, {
          objectId: session.object.id,
          keyId: 'self'  // Will use agent's default key
        });

        console.log(`[PDF-Signing] Sent signature for session ${session.id}, vault ${vaultId}`);
      } else {
        console.log(`[PDF-Signing] No signing session found for vault ${vaultId} - owner may not get notification`);
      }
    } catch (signingError: any) {
      console.error(`[PDF-Signing] Failed to send signature message:`, signingError.message);
      // Don't fail the request - vault sharing still worked
    }

    res.json({
      success: true,
      signedVault: {
        vaultId: signedVault.vaultId,
        docId: signedVault.docId,
        originalVaultId: vaultId,
        signedAt: new Date().toISOString(),
        signerName: signerName || 'Unknown',
      },
    });
  } catch (error: any) {
    console.error('Error uploading signed PDF:', error);
    res.status(500).json({
      error: 'Failed to upload signed PDF',
      message: error.message,
    });
  }
});

/**
 * Share a PDF vault with a connection for signing
 * POST /api/pdf-signing/share/:vaultId
 * Body: { connectionId }
 */
router.post('/share/:vaultId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { vaultId } = req.params;
    const { connectionId } = req.body;

    if (!connectionId) {
      return res.status(400).json({ error: 'connectionId is required' });
    }

    const agent = await getAgent({ tenantId });

    // Share the vault via DIDComm
    await agent.modules.vaults.shareSigningVault(vaultId, connectionId);

    console.log(`[PDF-Signing] Shared vault ${vaultId} with connection ${connectionId}`);
    await sendPdfSigningNotice(agent, connectionId, {
      type: 'pdf-signing-shared',
      vaultId,
      at: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'PDF vault shared for signing',
    });
  } catch (error: any) {
    console.error('Error sharing PDF vault:', error);
    if (error.message?.includes('not found')) {
      return res.status(404).json({
        error: 'Vault or connection not found',
        message: error.message,
      });
    }
    res.status(500).json({
      error: 'Failed to share PDF vault',
      message: error.message,
    });
  }
});

/**
 * Return a signed PDF to the original owner
 * POST /api/pdf-signing/return/:vaultId
 * Body: { ownerConnectionId }
 *
 * Uses KEM keys for decryption
 */
router.post('/return/:vaultId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { vaultId } = req.params;
    const { ownerConnectionId } = req.body;

    if (!ownerConnectionId) {
      return res.status(400).json({ error: 'ownerConnectionId is required' });
    }

    const agent = await getAgent({ tenantId });

    // Resolve KEM key for decryption
    const returnKemKey = await agent.modules.vaults.resolveVaultDecryptionKey(vaultId);
    if (!returnKemKey) {
      return res.status(400).json({
        error: 'KEM key not found',
        message: 'No encryption key found that can decrypt this vault. Please exchange keys first.',
      });
    }

    // Get the vault info for metadata
    const vaultInfo = await agent.modules.vaults.getInfo(vaultId);
    const vaultMetadata = vaultInfo?.header?.metadata || {};

    // Get the vault record
    const vaultRecord = await agent.modules.vaults.getRecord(vaultId);
    if (!vaultRecord) {
      return res.status(404).json({ error: 'Vault record not found' });
    }

    // Decrypt using KEM keys
    console.log(`[PDF-Signing] Opening vault ${vaultId} for return with KEM key ${returnKemKey.kid}`);
    const { document: signedPdf } = await agent.modules.vaults.openSigningVault(
      vaultRecord,
      returnKemKey.secretKey,
      returnKemKey.kid
    );

    // Return the signed document to the owner
    const result = await agent.modules.vaults.returnSignedDocument({
      signedDocument: signedPdf,
      originalVaultId: vaultMetadata.originalVaultId || vaultId,
      ownerConnectionId,
      documentType: 'pdf',
      metadata: {
        ...vaultMetadata,
        returnedAt: new Date().toISOString(),
      },
    });

    await sendPdfSigningNotice(agent, ownerConnectionId, {
      type: 'pdf-signing-signed-returned',
      originalVaultId: vaultMetadata.originalVaultId || vaultId,
      signedVaultId: result.vaultId,
      at: new Date().toISOString(),
    });

    res.json({
      success: true,
      returnedVault: {
        vaultId: result.vaultId,
        docId: result.docId,
        returnedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error returning signed PDF:', error);
    if (error.message?.includes('decrypt') || error.message?.includes('KEM') || error.message?.includes('key')) {
      return res.status(401).json({
        error: 'Decryption failed',
        message: 'Cannot decrypt vault - key mismatch or corrupted data',
      });
    }
    res.status(500).json({
      error: 'Failed to return signed PDF',
      message: error.message,
    });
  }
});

/**
 * Verify a PDF signature
 * POST /api/pdf-signing/verify/:vaultId
 *
 * Uses KEM keys for decryption
 */
router.post('/verify/:vaultId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { vaultId } = req.params;

    const agent = await getAgent({ tenantId });

    // Resolve KEM key for decryption
    const verifyKemKey = await agent.modules.vaults.resolveVaultDecryptionKey(vaultId);
    if (!verifyKemKey) {
      return res.status(400).json({
        error: 'KEM key not found',
        message: 'No encryption key found that can decrypt this vault. Please exchange keys first.',
      });
    }

    // Get the vault record
    const vaultRecord = await agent.modules.vaults.getRecord(vaultId);
    if (!vaultRecord) {
      return res.status(404).json({ error: 'Vault record not found' });
    }

    // Decrypt using KEM keys
    console.log(`[PDF-Signing] Verifying vault ${vaultId} with KEM key ${verifyKemKey.kid}`);
    const { document: pdfBytes } = await agent.modules.vaults.openSigningVault(
      vaultRecord,
      verifyKemKey.secretKey,
      verifyKemKey.kid
    );

    // Extract signature info
    const signatureInfo = await PdfUtils.extractSignatureInfo(pdfBytes);

    if (!signatureInfo.hasSig) {
      return res.json({
        success: true,
        hasSignature: false,
        message: 'PDF is not signed',
      });
    }

    // Verify the signature
    const verificationResult = await PdfUtils.verifyPdfSignature(pdfBytes);

    await updateSigningVaultMetadata(agent, vaultId, {
      verifiedAt: new Date().toISOString(),
      verificationValid: verificationResult.valid,
      verificationError: verificationResult.error || undefined,
    });
    await sendOwnerAckToSigner(agent, vaultRecord.header?.metadata, vaultId, 'verified');

    res.json({
      success: true,
      hasSignature: true,
      valid: verificationResult.valid,
      signerName: signatureInfo.signerName,
      reason: signatureInfo.reason,
      location: signatureInfo.location,
      signingTime: signatureInfo.signingTime,
      error: verificationResult.error,
    });
  } catch (error: any) {
    console.error('Error verifying PDF signature:', error);
    if (error.message?.includes('decrypt') || error.message?.includes('KEM') || error.message?.includes('key')) {
      return res.status(401).json({
        error: 'Decryption failed',
        message: 'Cannot decrypt vault - key mismatch or corrupted data',
      });
    }
    res.status(500).json({
      error: 'Failed to verify PDF signature',
      message: error.message,
    });
  }
});

/**
 * Get all PDF signing sessions
 * GET /api/pdf-signing/sessions
 *
 * Returns signing protocol sessions filtered to PDF documents.
 * Sessions track the DIDComm signing workflow state.
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const agent = await getAgent({ tenantId });

    const sessions = await agent.modules.signing.getAll();

    // Filter to PDF sessions (mediaType or fall back to all)
    const pdfSessions = sessions.filter((s: any) =>
      s.object?.mediaType === 'application/pdf' || !s.object?.mediaType
    );

    res.json({
      success: true,
      sessions: pdfSessions.map((s: any) => ({
        sessionId: s.id,
        state: s.state,
        role: s.role,
        vaultId: s.object?.id,
        connectionId: s.connectionId,
        mediaType: s.object?.mediaType,
        title: s.object?.displayHints?.title,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    });
  } catch (error: any) {
    console.error('Error getting signing sessions:', error);
    res.status(500).json({
      error: 'Failed to get signing sessions',
      message: error.message,
    });
  }
});

/**
 * Get PDF signing workflow status
 * GET /api/pdf-signing/status
 *
 * Returns vaults categorized by role:
 * - Owner: pendingToShare, awaitingSignature
 * - Signer: toSign, signedToReturn
 * - Both: completed
 *
 * Role detection:
 * - If signerConnectionId matches one of the user's connections → owner
 * - If signerConnectionId doesn't match user's connections → signer (received vault)
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const agent = await getAgent({ tenantId });

    // Get all signing sessions and build a map by vaultId (object.id)
    let sessionMap = new Map<string, any>();
    try {
      const sessions = await agent.modules.signing.getAll();
      sessionMap = new Map(
        sessions
          .filter((s: any) => s.object?.id)
          .map((s: any) => [s.object.id, s])
      );
      console.log('[PDF-Signing] Found signing sessions:', sessions.length);
    } catch (sessionError: any) {
      console.log('[PDF-Signing] Could not fetch signing sessions:', sessionError.message);
    }

    // Helper to determine signing state from session
    const getSessionSigningState = (vaultId: string): 'signed' | 'awaiting' | null => {
      const session = sessionMap.get(vaultId);
      if (session) {
        // partial-signature-received or completed means signed!
        if (session.state === 'partial-signature-received' || session.state === 'completed') {
          return 'signed';
        }
        if (session.state === 'request-sent' || session.state === 'request-received') {
          return 'awaiting';
        }
      }
      return null; // No session or unknown state - fallback to vault metadata
    };

    // Get all user's connections to determine role
    const connections = await agent.didcomm.connections.getAll();
    const myConnectionIds = new Set(connections.map((c: any) => c.id));
    console.log('[PDF-Signing] User has connections:', myConnectionIds.size);

    // Get all vaults that are PDFs
    const allVaults = await agent.modules.vaults.list();
    console.log('[PDF-Signing] Found vaults:', allVaults.length);

    const pdfVaults = allVaults.filter((v: any) => {
      const meta = v.header?.metadata;
      return meta?.mimeType === 'application/pdf' || meta?.documentType === 'pdf';
    });
    console.log('[PDF-Signing] PDF vaults:', pdfVaults.length);

    // Determine role for each vault.
    // Key insight: when a vault is shared via DIDComm, the StoreVaultHandler
    // preserves the original metadata (including role:'owner') and adds
    // receivedFrom/receivedAt. So we use receivedFrom as the primary signal
    // that we received this vault from someone else.
    const ownedVaults: any[] = [];
    let receivedVaults: any[] = [];

    for (const vault of pdfVaults) {
      const meta = vault.header?.metadata;
      const wasReceived = !!meta?.receivedFrom;

      if (wasReceived) {
        // We received this vault from someone else via DIDComm
        if (meta?.isSigned || meta?.role === 'signer') {
          // Signed document returned to owner
          ownedVaults.push(vault);
        } else {
          // Document sent to us for signing
          receivedVaults.push(vault);
        }
      } else {
        // We created this vault locally
        if (meta?.role === 'signer') {
          // We signed this document (our local copy)
          receivedVaults.push(vault);
        } else {
          // We own this document
          ownedVaults.push(vault);
        }
      }
    }

    console.log('[PDF-Signing] Owned vaults:', ownedVaults.length, 'Received vaults:', receivedVaults.length);

    // If a signer-local copy exists for an original, hide other signer vaults for the same original
    const signerLocalCopyOriginalIds = new Set(
      receivedVaults
        .filter((v: any) => v.header?.metadata?.signerLocalCopy && v.header?.metadata?.originalVaultId)
        .map((v: any) => v.header?.metadata?.originalVaultId)
    );
    if (signerLocalCopyOriginalIds.size > 0) {
      receivedVaults = receivedVaults.filter((v: any) => {
        const meta = v.header?.metadata;
        if (!meta?.originalVaultId) return true;
        if (meta?.signerLocalCopy) return true;
        return !signerLocalCopyOriginalIds.has(meta.originalVaultId);
      });
    }

    const signedOriginalIds = new Set(
      pdfVaults
        .filter((v: any) => v.header?.metadata?.isSigned || v.header?.metadata?.returnedAt)
        .map((v: any) => v.header?.metadata?.originalVaultId)
        .filter((id: any) => typeof id === 'string' && id.length > 0)
    );

    // Owner's view - use session state OR vault metadata to determine if signed
    const pendingToShare: any[] = []; // Empty - we auto-share now
    const awaitingSignature = ownedVaults.filter((v: any) => {
      const meta = v.header?.metadata;
      const sessionState = getSessionSigningState(v.vaultId);
      // If a signed vault references this as the original, it's no longer awaiting
      if (signedOriginalIds.has(v.vaultId)) return false;
      // If session says signed, it's not awaiting
      if (sessionState === 'signed') return false;
      // If vault metadata says signed (e.g. returned signed document), it's not awaiting
      if (meta?.isSigned) return false;
      // If explicitly returned, it's completed
      if (meta?.returnedAt) return false;
      return true;
    });

    // Signed vaults - determined by session state OR metadata (owner sees these)
    const signedVaults = ownedVaults.filter((v: any) => {
      const sessionState = getSessionSigningState(v.vaultId);
      const meta = v.header?.metadata;
      const isSigned = sessionState === 'signed' || meta?.isSigned;
      // Keep signed docs in Owner "Signed Documents" even after verify/download
      return isSigned;
    });

    // Signer's view - use session state
    const toSign = receivedVaults.filter((v: any) => {
      const meta = v.header?.metadata;
      const sessionState = getSessionSigningState(v.vaultId);
      // If a signed vault references this as the original, it's no longer to sign
      if (signedOriginalIds.has(v.vaultId)) return false;
      // Session says signed → not to sign
      if (sessionState === 'signed') return false;
      // Vault metadata says signed → not to sign
      if (meta?.isSigned) return false;
      return true;
    });
    // Include wallet-originated signing sessions that have no corresponding vault.
    // Auto-create an encrypted vault for each new session so it appears in the
    // Vaults section too. Until the vault is persisted (first-load async), we
    // inject a synthetic toSign entry so the UI shows it immediately.
    try {
      // Sessions already backed by a real vault (keyed by sessionId metadata)
      const vaultedSessionIds = new Set(
        pdfVaults
          .filter((v: any) => v.header?.metadata?.sessionId)
          .map((v: any) => v.header.metadata.sessionId as string)
      );
      const vaultObjectIds = new Set(pdfVaults.map((v: any) => v.vaultId));
      const allSessions = await agent.modules.signing.getAll();
      for (const session of allSessions) {
        if (session.role !== 'signer') continue;
        if (!['request-received', 'consent-sent'].includes(session.state)) continue;
        if (session.object?.id && vaultObjectIds.has(session.object.id)) continue;
        const payload = decodeSessionPayload(session.object);
        if (!payload?.pdfBase64) continue; // skip sessions with no embedded PDF

        // Already has a vault — it will appear via the normal vault path; skip synthetic entry
        if (vaultedSessionIds.has(session.id)) continue;

        // Kick off background vault creation (deduped by inFlightVaultCreations)
        if (!inFlightVaultCreations.has(session.id)) {
          inFlightVaultCreations.add(session.id);
          autoCreateVaultForSession(agent, session, payload)
            .then(() => inFlightVaultCreations.delete(session.id))
            .catch((err: any) => {
              inFlightVaultCreations.delete(session.id);
              console.warn('[PDF-Signing] Auto-create vault failed:', err?.message || err);
            });
        }

        // Synthetic entry: shown on this response; replaced by real vault on next refresh
        const fields = payload.fields || [];
        toSign.push({
          vaultId: session.id,
          header: {
            metadata: {
              filename: session.object?.displayHints?.title || 'Signing Request',
              description: session.object?.displayHints?.summary,
              mimeType: 'application/pdf',
              role: 'signer',
              createdAt: session.createdAt?.toISOString?.() || new Date().toISOString(),
              isSessionBased: true,
              sessionId: session.id,
              signerConnectionId: session.connectionId,
              ...(fields.length > 0 ? { signingFields: fields } : {}),
            },
          },
          createdAt: session.createdAt,
        });
      }
    } catch (err: any) {
      console.warn('[PDF-Signing] Could not include session-based requests in toSign:', err.message);
    }

    const signedToReturn = receivedVaults.filter((v: any) => {
      const meta = v.header?.metadata;
      const sessionState = getSessionSigningState(v.vaultId);
      // Session state or metadata indicates signed, and owner has not yet acknowledged
      return (sessionState === 'signed' || meta?.isSigned) && !meta?.ownerAckAt;
    });

    // Completed - owner ack (owner side) OR owner-ack received (signer side)
    // Completed (signer view) - owner acknowledged (verify/download)
    const completed = receivedVaults.filter((v: any) => {
      const meta = v.header?.metadata;
      return !!meta?.ownerAckAt;
    });

    // Build signing progress for multi-recipient groups
    // Maps signingGroupId → { signed, required, total, signers[] }
    const groupProgressMap = new Map<string, { signed: number; required: number; total: number; signers: { connectionId: string; isSigned: boolean }[] }>();
    for (const v of ownedVaults) {
      const meta = v.header?.metadata;
      const groupId = meta?.signingGroupId;
      if (!groupId) continue;

      if (!groupProgressMap.has(groupId)) {
        groupProgressMap.set(groupId, {
          signed: 0,
          required: meta?.threshold || meta?.totalSigners || 1,
          total: meta?.totalSigners || 1,
          signers: [],
        });
      }

      const progress = groupProgressMap.get(groupId)!;
      const sessionState = getSessionSigningState(v.vaultId);
      const vaultSigned = sessionState === 'signed' || meta?.isSigned;
      if (vaultSigned) progress.signed++;
      progress.signers.push({
        connectionId: meta?.signerConnectionId,
        isSigned: !!vaultSigned,
      });
    }

    // Helper to map vault to response format with session state
    const mapVault = (v: any, detectedRole?: string) => {
      const session = sessionMap.get(v.vaultId);
      const sessionState = getSessionSigningState(v.vaultId);
      const meta = v.header?.metadata;
      const groupId = meta?.signingGroupId;
      const groupProgress = groupId ? groupProgressMap.get(groupId) : undefined;

      return {
        vaultId: v.vaultId,
        filename: meta?.filename || v.filename,
        description: meta?.description || v.description,
        role: meta?.role || v.role || detectedRole,
        status: meta?.status || v.status,
        signerConnectionId: meta?.signerConnectionId || v.signerConnectionId,
        ownerConnectionId: meta?.ownerConnectionId || v.ownerConnectionId,
        allowSignerCopy: meta?.allowSignerCopy ?? v.allowSignerCopy,
        isSigned: sessionState === 'signed' || meta?.isSigned || v.isSigned,
        signedAt: meta?.signedAt || v.signedAt,
        sharedAt: meta?.sharedAt || v.sharedAt,
        returnedAt:
          meta?.returnedAt ||
          (meta?.role === 'signer' ? meta?.receivedAt : undefined) ||
          v.returnedAt,
        downloadedAt: meta?.downloadedAt || v.downloadedAt,
        verifiedAt: meta?.verifiedAt || v.verifiedAt,
        verificationValid: meta?.verificationValid ?? v.verificationValid,
        ownerAckAt: meta?.ownerAckAt || v.ownerAckAt,
        ownerAckAction: meta?.ownerAckAction || v.ownerAckAction,
        signerLocalCopy: meta?.signerLocalCopy ?? v.signerLocalCopy,
        createdAt: meta?.createdAt || v.createdAt,
        signingFields: meta?.signingFields || v.signingFields,
        // Session info for debugging/UI
        sessionState: session?.state,
        sessionRole: session?.role,
        // Multi-recipient fields
        signingGroupId: groupId,
        threshold: meta?.threshold || v.threshold,
        totalSigners: meta?.totalSigners || v.totalSigners,
        signerIndex: meta?.signerIndex ?? v.signerIndex,
        signingProgress: groupProgress,
        // Session-based (wallet-originated, no vault)
        isSessionBased: meta?.isSessionBased || v.isSessionBased || false,
        sessionId: meta?.sessionId || v.sessionId,
      };
    };

    res.json({
      success: true,
      status: {
        total: pdfVaults.length,
        // Owner stats
        pendingToShare: pendingToShare.length,
        awaitingSignature: awaitingSignature.length,
        signed: signedVaults.length,  // New: vaults with confirmed signatures
        // Signer stats
        toSign: toSign.length,
        signedToReturn: signedToReturn.length,
        // Completed
        completed: completed.length,
      },
      vaults: {
        // Owner's view
        pendingToShare: pendingToShare.map(v => mapVault(v, 'owner')),
        awaitingSignature: awaitingSignature.map(v => mapVault(v, 'owner')),
        signed: signedVaults.map(v => mapVault(v, 'owner')),  // Confirmed signed (via session)
        // Signer's view
        toSign: toSign.map(v => mapVault(v, 'signer')),
        signedToReturn: signedToReturn.map(v => mapVault(v, 'signer')),
        // Completed (both)
        completed: completed.map((v: any) => mapVault(v)),
      },
    });
  } catch (error: any) {
    console.error('Error getting PDF signing status:', error);
    res.status(500).json({
      error: 'Failed to get PDF signing status',
      message: error.message,
    });
  }
});

/**
 * Decode the PDF + fields payload embedded in a signing session's previewLinks.
 * The wallet encodes: data:application/json;base64,<base64 JSON with pdfBase64 + fields>
 */
function decodeSessionPayload(object: any): { pdfBase64: string; fields?: any[]; title?: string } | null {
  try {
    const link: string | undefined = object?.previewLinks?.[0] ?? object?.displayHints?.previewLinks?.[0];
    if (!link || !link.startsWith('data:application/json;base64,')) return null;
    const json = Buffer.from(link.slice('data:application/json;base64,'.length), 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Serve the PDF embedded in a wallet-originated signing session.
 * GET /api/pdf-signing/session/:sessionId/pdf
 */
router.get('/session/:sessionId/pdf', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { sessionId } = req.params;
    const agent = await getAgent({ tenantId });

    let session: any = null;
    try { session = await agent.modules.signing.getById(sessionId); } catch {}
    if (!session) {
      const all = await agent.modules.signing.getAll();
      session = all.find((s: any) => s.sessionId === sessionId || s.id === sessionId);
    }
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const payload = decodeSessionPayload(session.object);
    if (!payload?.pdfBase64) {
      return res.status(400).json({ error: 'No embedded PDF found in this session' });
    }

    const pdfBytes = Buffer.from(payload.pdfBase64, 'base64');
    const filename = session.object?.displayHints?.title || 'document.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBytes);
  } catch (error: any) {
    console.error('Error serving session PDF:', error);
    res.status(500).json({ error: 'Failed to serve session PDF', message: error.message });
  }
});

/**
 * Sign a wallet-originated session and return the signed PDF via vault sharing.
 * POST /api/pdf-signing/session/:sessionId/sign
 * Body: multipart/form-data with 'file' (signed PDF), optional 'signerName'
 */
router.post('/session/:sessionId/sign', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { sessionId } = req.params;
    const { signerName } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'Signed PDF file is required' });

    const agent = await getAgent({ tenantId });

    let session: any = null;
    try { session = await agent.modules.signing.getById(sessionId); } catch {}
    if (!session) {
      const all = await agent.modules.signing.getAll();
      session = all.find((s: any) => s.sessionId === sessionId || s.id === sessionId);
    }
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const signedPdfBytes = new Uint8Array(file.buffer);
    const ownerConnectionId = session.connectionId;

    // Find the auto-created vault for this session (keyed by sessionId = session.id).
    // Its vaultId is used as originalVaultId so the status endpoint can filter it
    // out of the "toSign" list via the signedOriginalIds check.
    let autoCreatedVaultId: string | undefined;
    try {
      const allVaults = await agent.modules.vaults.list();
      const autoCreatedVault = allVaults.find(
        (v: any) => v.header?.metadata?.sessionId === session.id
      );
      autoCreatedVaultId = autoCreatedVault?.vaultId;
    } catch {}

    // Retrieve original vault metadata if available
    const vaultId = session.object?.id;
    let originalMetadata: Record<string, any> = {};
    if (vaultId) {
      try {
        const vaultInfo = await agent.modules.vaults.getInfo(vaultId);
        if (vaultInfo?.header?.metadata) {
          const { receivedFrom, receivedAt, lastReceivedFrom, lastReceivedAt, ...meta } =
            vaultInfo.header.metadata as Record<string, any>;
          originalMetadata = meta;
        }
      } catch {}
    }

    // Create a signed vault and share it back to the owner via the vault protocol.
    // Using vault sharing (same as upload-signed) avoids the DIDComm signing protocol's
    // threshold check, which would fail because no cryptographic partial-signature was
    // registered via signing.sign() before this call.
    const signedVault = await agent.modules.vaults.createSigningVault({
      document: signedPdfBytes,
      signerConnectionId: ownerConnectionId,
      documentType: 'pdf',
      metadata: {
        ...originalMetadata,
        filename: session.object?.displayHints?.title || originalMetadata?.filename || 'signed-document.pdf',
        // Use the auto-created vault's vaultId so the status endpoint filters it from toSign
        originalVaultId: autoCreatedVaultId || vaultId || session.id,
        signedAt: new Date().toISOString(),
        signerName: signerName || 'Unknown',
        isSigned: true,
        returnedAt: new Date().toISOString(),
        role: 'signer',
        signedClientSide: true,
      },
    });

    console.log(`[PDF-Signing] Created signed vault ${signedVault.vaultId} for session ${session.id}`);

    try {
      await agent.modules.vaults.shareSigningVault(signedVault.vaultId, ownerConnectionId);
      console.log(`[PDF-Signing] Shared signed vault ${signedVault.vaultId} back to owner via connection ${ownerConnectionId}`);
      await sendPdfSigningNotice(agent, ownerConnectionId, {
        type: 'pdf-signing-signed-returned',
        originalVaultId: autoCreatedVaultId || vaultId || session.id,
        signedVaultId: signedVault.vaultId,
        at: new Date().toISOString(),
      });
    } catch (shareError: any) {
      console.error(`[PDF-Signing] Failed to share signed vault back to owner:`, shareError.message);
    }

    console.log(`[PDF-Signing] Returned signed artifact for session ${session.id} to owner`);
    res.json({ success: true, sessionId: session.sessionId || session.id });
  } catch (error: any) {
    console.error('Error signing session-based request:', error);
    res.status(500).json({ error: 'Failed to sign session', message: error.message });
  }
});

export default router;
