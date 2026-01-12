import { Router, Request, Response } from 'express';
import { getAgent } from '../services/agentService';
import { PdfUtils, SignaturePlaceholderOptions } from '@ajna-inc/signing';
import multer from 'multer';

// KEM keypair tag (must match connectionRoutes.ts and agentService.ts)
const KEM_KEYPAIR_TAG = 'kem-keypair-connection';

/**
 * Helper to get KEM secret key for a connection
 * Returns the secretKey and kid needed to decrypt signing vaults
 */
async function getKemSecretKey(agent: any, connectionId: string): Promise<{ secretKey: Uint8Array; kid: string } | null> {
  const keypairs = await agent.genericRecords.findAllByQuery({
    type: KEM_KEYPAIR_TAG,
    connectionId: connectionId,
  });

  if (keypairs.length === 0) {
    return null;
  }

  const keypair = keypairs[0];
  return {
    kid: keypair.content.kid as string,
    secretKey: new Uint8Array(Buffer.from(keypair.content.secretKey as string, 'base64url')),
  };
}

/**
 * Helper to find the KEM key that can decrypt a vault
 * Matches the vault's recipient kids with our stored KEM keys
 */
async function findMatchingKemKey(agent: any, vaultInfo: any): Promise<{ secretKey: Uint8Array; kid: string; connectionId: string } | null> {
  // Get all recipient kids from the vault header
  const recipients = vaultInfo.header?.recipients || [];
  const recipientKids = new Set(recipients.map((r: any) => r.kid));

  if (recipientKids.size === 0) {
    console.log('[PDF-Signing] No recipients found in vault header');
    return null;
  }

  console.log(`[PDF-Signing] Looking for KEM key matching recipients: ${Array.from(recipientKids).join(', ')}`);

  // Find a local KEM keypair whose kid matches one of the recipients
  const allKeypairs = await agent.genericRecords.findAllByQuery({
    type: KEM_KEYPAIR_TAG,
  });

  for (const keypair of allKeypairs) {
    const kid = keypair.content.kid as string;
    if (recipientKids.has(kid)) {
      // connectionId can be in tags or content
      const connectionId = (keypair.tags?.connectionId || keypair.content.connectionId) as string;
      console.log(`[PDF-Signing] Found matching KEM key: ${kid} for connection ${connectionId}`);
      return {
        kid,
        secretKey: new Uint8Array(Buffer.from(keypair.content.secretKey as string, 'base64url')),
        connectionId,
      };
    }
  }

  console.log('[PDF-Signing] No matching KEM key found for vault recipients');
  return null;
}

/**
 * Helper to find the connection ID for a vault based on its metadata
 * For owner: uses signerConnectionId
 * For signer: looks up who sent the vault
 */
async function findVaultConnectionId(agent: any, vaultInfo: any): Promise<string | null> {
  const meta = vaultInfo.header?.metadata;

  // If we're the owner, the signerConnectionId is our connection to the signer
  if (meta?.role === 'owner' && meta?.signerConnectionId) {
    return meta.signerConnectionId;
  }

  // For received vaults, find matching KEM key
  const matchingKey = await findMatchingKemKey(agent, vaultInfo);
  if (matchingKey) {
    return matchingKey.connectionId;
  }

  return null;
}

const router = Router();

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
    const { recipientConnectionId, description } = req.body;
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
        createdAt: new Date().toISOString(),
      },
    });

    console.log(`[PDF-Signing] Created vault ${result.vaultId} for connection ${recipientConnectionId}`);

    // Auto-share the vault with the recipient
    try {
      await agent.modules.vaults.shareSigningVault(result.vaultId, recipientConnectionId);
      console.log(`[PDF-Signing] Auto-shared vault ${result.vaultId} with connection ${recipientConnectionId}`);
    } catch (shareError: any) {
      console.error(`[PDF-Signing] Failed to auto-share vault ${result.vaultId}:`, shareError.message);
      // Don't fail the upload if sharing fails - vault is still created
    }

    res.json({
      success: true,
      vault: {
        vaultId: result.vaultId,
        docId: result.docId,
        filename: file.originalname,
        size: file.size,
        recipientConnectionId,
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

    const agent = await getAgent({ tenantId });

    // Get vault info to find the connection
    const vaultInfo = await agent.modules.vaults.getInfo(vaultId);
    if (!vaultInfo) {
      return res.status(404).json({ error: 'Vault not found' });
    }

    const signMeta = vaultInfo.header?.metadata;
    let signKemKey: { secretKey: Uint8Array; kid: string } | null = null;
    let signConnectionId: string | undefined = undefined;

    // For owner-role vaults, use the signerConnectionId
    if (signMeta?.role === 'owner' && signMeta?.signerConnectionId) {
      const ownerConnectionId = signMeta.signerConnectionId as string;
      signConnectionId = ownerConnectionId;
      signKemKey = await getKemSecretKey(agent, ownerConnectionId);
    } else {
      // For received vaults, find the matching KEM key by checking vault recipients
      const matchingKey = await findMatchingKemKey(agent, vaultInfo);
      if (matchingKey) {
        signKemKey = { secretKey: matchingKey.secretKey, kid: matchingKey.kid };
        signConnectionId = matchingKey.connectionId;
      }
    }

    if (!signKemKey || !signConnectionId) {
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

    // Decrypt using KEM keys (not passphrase)
    console.log(`[PDF-Signing] Opening signing vault ${vaultId} with KEM key ${signKemKey.kid}`);
    const { document: pdfBytes } = await agent.modules.vaults.openSigningVault(
      vaultRecord,
      signKemKey.secretKey,
      signKemKey.kid
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

    const originalMetadata = vaultInfo.header?.metadata || {};

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
        role: 'signer', // Mark as signer's vault
      },
    });

    console.log(`[PDF-Signing] Created signed vault ${signedVault.vaultId}`);

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

    // Get vault info for filename and connection
    const vaultInfo = await agent.modules.vaults.getInfo(vaultId);
    if (!vaultInfo) {
      return res.status(404).json({ error: 'Vault not found' });
    }

    const meta = vaultInfo.header?.metadata;
    let kemKey: { secretKey: Uint8Array; kid: string } | null = null;

    // For owner-role vaults, use the signerConnectionId
    if (meta?.role === 'owner' && meta?.signerConnectionId) {
      kemKey = await getKemSecretKey(agent, meta.signerConnectionId);
    } else {
      // For received vaults, find the matching KEM key by checking vault recipients
      const matchingKey = await findMatchingKemKey(agent, vaultInfo);
      if (matchingKey) {
        kemKey = { secretKey: matchingKey.secretKey, kid: matchingKey.kid };
      }
    }

    if (!kemKey) {
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

    // Find the connection ID for this vault
    const uploadMeta = vaultInfo.header?.metadata;
    let uploadConnectionId: string | undefined = undefined;

    // For owner-role vaults, use the signerConnectionId
    if (uploadMeta?.role === 'owner' && uploadMeta?.signerConnectionId) {
      uploadConnectionId = uploadMeta.signerConnectionId;
    } else {
      // For received vaults, find the matching KEM key by checking vault recipients
      const matchingKey = await findMatchingKemKey(agent, vaultInfo);
      if (matchingKey) {
        uploadConnectionId = matchingKey.connectionId;
      }
    }

    if (!uploadConnectionId) {
      return res.status(400).json({
        error: 'No KEM keys found',
        message: 'Cannot store signed vault - no encryption keys available for this connection',
      });
    }

    const signedPdfBytes = new Uint8Array(file.buffer);
    const originalMetadata = vaultInfo.header?.metadata || {};

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
        role: 'signer',
        signedClientSide: true, // Flag to indicate client-side signing
      },
    });

    console.log(`[PDF-Signing] Created client-side signed vault ${signedVault.vaultId} for original ${vaultId}`);

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
 * Body: { ownerConnectionId, passphrase }
 */
router.post('/return/:vaultId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { vaultId } = req.params;
    const { ownerConnectionId, passphrase } = req.body;

    if (!ownerConnectionId) {
      return res.status(400).json({ error: 'ownerConnectionId is required' });
    }

    if (!passphrase) {
      return res.status(400).json({ error: 'passphrase is required' });
    }

    const agent = await getAgent({ tenantId });

    // Get the vault info (metadata is in header.metadata)
    const vaultInfo = await agent.modules.vaults.getInfo(vaultId);
    const vaultMetadata = vaultInfo.header?.metadata || {};

    // Decrypt the signed PDF
    const signedPdf = await agent.modules.vaults.open(vaultId, { passphrase });

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
    if (error.message?.includes('decrypt') || error.message?.includes('passphrase')) {
      return res.status(401).json({
        error: 'Decryption failed',
        message: 'Invalid passphrase or corrupted vault',
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
 * Body: { passphrase }
 */
router.post('/verify/:vaultId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { vaultId } = req.params;
    const { passphrase } = req.body;

    if (!passphrase) {
      return res.status(400).json({ error: 'Passphrase is required' });
    }

    const agent = await getAgent({ tenantId });

    // Decrypt the vault
    const pdfBytes = await agent.modules.vaults.open(vaultId, { passphrase });

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
    if (error.message?.includes('decrypt') || error.message?.includes('passphrase')) {
      return res.status(401).json({
        error: 'Decryption failed',
        message: 'Invalid passphrase or corrupted vault',
      });
    }
    res.status(500).json({
      error: 'Failed to verify PDF signature',
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

    // Determine role for each vault based on signerConnectionId
    // - If signerConnectionId is in my connections → I'm the owner (I created it)
    // - If signerConnectionId is NOT in my connections → I'm the signer (I received it)
    const ownedVaults: any[] = [];
    const receivedVaults: any[] = [];

    for (const vault of pdfVaults) {
      const meta = vault.header?.metadata;
      const signerConnId = meta?.signerConnectionId;

      // Check explicit role first (for vaults created with new metadata)
      if (meta?.role === 'owner') {
        ownedVaults.push(vault);
      } else if (meta?.role === 'signer') {
        receivedVaults.push(vault);
      } else if (signerConnId && myConnectionIds.has(signerConnId)) {
        // signerConnectionId matches my connection → I created this vault
        ownedVaults.push(vault);
      } else {
        // signerConnectionId doesn't match → I received this vault
        receivedVaults.push(vault);
      }
    }

    console.log('[PDF-Signing] Owned vaults:', ownedVaults.length, 'Received vaults:', receivedVaults.length);

    // Owner's view - with auto-share, all owned vaults go directly to awaiting signature
    const pendingToShare: any[] = []; // Empty - we auto-share now
    const awaitingSignature = ownedVaults.filter((v: any) => {
      const meta = v.header?.metadata;
      return !meta?.returnedAt; // All owned vaults not returned are awaiting signature
    });

    // Signer's view
    const toSign = receivedVaults.filter((v: any) => {
      const meta = v.header?.metadata;
      return !meta?.isSigned;
    });
    const signedToReturn = receivedVaults.filter((v: any) => {
      const meta = v.header?.metadata;
      return meta?.isSigned && !meta?.returnedAt;
    });

    // Completed (both roles)
    const completed = pdfVaults.filter((v: any) => {
      const meta = v.header?.metadata;
      return meta?.returnedAt;
    });

    // Helper to map vault to response format
    const mapVault = (v: any, detectedRole?: string) => ({
      vaultId: v.vaultId,
      filename: v.header?.metadata?.filename,
      description: v.header?.metadata?.description,
      role: v.header?.metadata?.role || detectedRole,
      status: v.header?.metadata?.status,
      signerConnectionId: v.header?.metadata?.signerConnectionId,
      ownerConnectionId: v.header?.metadata?.ownerConnectionId,
      isSigned: v.header?.metadata?.isSigned,
      signedAt: v.header?.metadata?.signedAt,
      sharedAt: v.header?.metadata?.sharedAt,
      returnedAt: v.header?.metadata?.returnedAt,
      createdAt: v.header?.metadata?.createdAt || v.createdAt,
    });

    res.json({
      success: true,
      status: {
        total: pdfVaults.length,
        // Owner stats
        pendingToShare: pendingToShare.length,
        awaitingSignature: awaitingSignature.length,
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
