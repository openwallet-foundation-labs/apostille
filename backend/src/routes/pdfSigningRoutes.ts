import { Router, Request, Response } from 'express';
import { getAgent } from '../services/agentService';
import { PdfUtils, SignaturePlaceholderOptions } from '@ajna-inc/signing';
import { VaultRepository } from '@ajna-inc/vaults/build/repository/VaultRepository';
import { VaultRecord } from '@ajna-inc/vaults/build/repository/VaultRecord';
import { VaultEncryptionService, generateUuid, toBase64Url } from '@ajna-inc/vaults/build';
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
        await agent.basicMessages.sendMessage(connectionId, JSON.stringify(payload));
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

const sendPdfSigningNotice = async (
  agent: any,
  connectionId: string,
  payload: Record<string, unknown>
) => {
  try {
    if (!connectionId) return;
    await agent.basicMessages.sendMessage(connectionId, JSON.stringify(payload));
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
 * Upload a PDF and create an encrypted vault for signing
 * POST /api/pdf-signing/upload
 * Body: multipart/form-data with 'file' and 'recipientConnectionId'
 *
 * Uses ML-KEM-768 encryption to the recipient's public key.
 * Both parties must have exchanged KEM keys before uploading.
 */
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { recipientConnectionId, description, signingFields: signingFieldsJson } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'PDF file is required' });
    }

    if (!recipientConnectionId) {
      return res.status(400).json({
        error: 'recipientConnectionId is required',
        message: 'Please select a connection to send the PDF to'
      });
    }

    const agent = await getAgent({ tenantId });

    // Check if the connection exists
    const connection = await agent.connections.findById(recipientConnectionId);
    if (!connection) {
      return res.status(404).json({
        error: 'Connection not found',
        message: `Connection ${recipientConnectionId} does not exist`
      });
    }

    // Check if we have the recipient's KEM key
    const hasPeerKey = await agent.modules.vaults.hasPeerKemKey(recipientConnectionId);
    if (!hasPeerKey) {
      return res.status(400).json({
        error: 'Key exchange required',
        message: 'Please exchange encryption keys with this connection first'
      });
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

    // Create a signing vault encrypted to the recipient's KEM key
    const result = await agent.modules.vaults.createSigningVault({
      document: pdfBytes,
      signerConnectionId: recipientConnectionId,
      documentType: 'pdf',
      metadata: {
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        description: description || 'PDF for signing',
        role: 'owner',  // This user owns the document
        signerConnectionId: recipientConnectionId,  // Who should sign it
        allowSignerCopy: true,
        createdAt: new Date().toISOString(),
        ...(signingFields.length > 0 ? { signingFields } : {}),
      },
    });

    console.log(`[PDF-Signing] Created vault ${result.vaultId} for connection ${recipientConnectionId}`);

    // Auto-share the vault with the recipient
    try {
      await agent.modules.vaults.shareSigningVault(result.vaultId, recipientConnectionId);
      console.log(`[PDF-Signing] Auto-shared vault ${result.vaultId} with connection ${recipientConnectionId}`);
      await sendPdfSigningNotice(agent, recipientConnectionId, {
        type: 'pdf-signing-shared',
        vaultId: result.vaultId,
        at: new Date().toISOString(),
      });
    } catch (shareError: any) {
      console.error(`[PDF-Signing] Failed to auto-share vault ${result.vaultId}:`, shareError.message);
      // Don't fail the upload if sharing fails - vault is still created
    }

    // Create a signing session using the DIDComm Signing Protocol
    // This enables automatic status tracking and notifications
    let signingSessionId: string | undefined;
    try {
      const pdfDigest = crypto.createHash('sha256').update(pdfBytes).digest('base64url');

      const signingSession = await agent.modules.signing.requestSigning(recipientConnectionId, {
        object: {
          id: result.vaultId,  // Use vaultId as object.id for linkage
          mediaType: 'application/pdf',
          canonicalization: { method: 'raw-bytes@1', parameters: {} },
          digest: { alg: 'sha-256', value: pdfDigest },
          displayHints: { title: file.originalname }
        },
        suite: {
          suite: 'pades-b-lta@1',
          keyBinding: { controller: 'self', proofPurpose: 'assertionMethod' }
        }
      });

      signingSessionId = signingSession.id;
      console.log(`[PDF-Signing] Created signing session ${signingSession.id} for vault ${result.vaultId}`);
    } catch (signingError: any) {
      console.error(`[PDF-Signing] Failed to create signing session:`, signingError.message);
      // Don't fail the upload - vault sharing still works without protocol
    }

    res.json({
      success: true,
      vault: {
        vaultId: result.vaultId,
        docId: result.docId,
        filename: file.originalname,
        size: file.size,
        recipientConnectionId,
        signingSessionId,
      },
    });
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
    const connections = await agent.connections.getAll();
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

    // Helper to map vault to response format with session state
    const mapVault = (v: any, detectedRole?: string) => {
      const session = sessionMap.get(v.vaultId);
      const sessionState = getSessionSigningState(v.vaultId);
      return {
        vaultId: v.vaultId,
        filename: v.header?.metadata?.filename,
        description: v.header?.metadata?.description,
        role: v.header?.metadata?.role || detectedRole,
        status: v.header?.metadata?.status,
        signerConnectionId: v.header?.metadata?.signerConnectionId,
        ownerConnectionId: v.header?.metadata?.ownerConnectionId,
        allowSignerCopy: v.header?.metadata?.allowSignerCopy,
        isSigned: sessionState === 'signed' || v.header?.metadata?.isSigned,
        signedAt: v.header?.metadata?.signedAt,
        sharedAt: v.header?.metadata?.sharedAt,
        returnedAt:
          v.header?.metadata?.returnedAt ||
          (v.header?.metadata?.role === 'signer' ? v.header?.metadata?.receivedAt : undefined),
        downloadedAt: v.header?.metadata?.downloadedAt,
        verifiedAt: v.header?.metadata?.verifiedAt,
        verificationValid: v.header?.metadata?.verificationValid,
        ownerAckAt: v.header?.metadata?.ownerAckAt,
        ownerAckAction: v.header?.metadata?.ownerAckAction,
        signerLocalCopy: v.header?.metadata?.signerLocalCopy,
        createdAt: v.header?.metadata?.createdAt || v.createdAt,
        signingFields: v.header?.metadata?.signingFields,
        // Session info for debugging/UI
        sessionState: session?.state,
        sessionRole: session?.role,
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

export default router;
