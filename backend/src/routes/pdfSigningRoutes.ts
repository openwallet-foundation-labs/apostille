import { Router, Request, Response } from 'express';
import { getAgent } from '../services/agentService';
import { PdfUtils, SignaturePlaceholderOptions } from '@ajna-inc/signing';
import multer from 'multer';
import crypto from 'crypto';

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
        status: 'pending_share',  // Track workflow state
        createdAt: new Date().toISOString(),
      },
    });

    console.log(`[PDF-Signing] Created vault ${result.vaultId} for connection ${recipientConnectionId}`);

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
 * Body: { passphrase, certificate, privateKey, reason?, location?, name? }
 */
router.post('/sign/:vaultId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { vaultId } = req.params;
    const { passphrase, certificate, privateKey, reason, location, name, contactInfo } = req.body;

    if (!passphrase) {
      return res.status(400).json({ error: 'Passphrase is required' });
    }

    if (!certificate || !privateKey) {
      return res.status(400).json({ error: 'Certificate and private key are required for signing' });
    }

    const agent = await getAgent({ tenantId });

    // Decrypt the vault to get the PDF
    const pdfBytes = await agent.modules.vaults.open(vaultId, { passphrase });

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

    // Get the original vault info for metadata (stored in header.metadata)
    const vaultInfo = await agent.modules.vaults.getInfo(vaultId);
    const originalMetadata = vaultInfo.header?.metadata || {};

    // Create a new vault with the signed PDF
    const signedVault = await agent.modules.vaults.create(signedPdf, {
      passphrase,
      metadata: {
        ...originalMetadata,
        originalVaultId: vaultId,
        signedAt: new Date().toISOString(),
        signerName: name,
        signatureReason: reason,
        isSigned: true,
      },
    });

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
    if (error.message?.includes('decrypt') || error.message?.includes('passphrase')) {
      return res.status(401).json({
        error: 'Decryption failed',
        message: 'Invalid passphrase or corrupted vault',
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
 * Body: { passphrase }
 */
router.post('/download/:vaultId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { vaultId } = req.params;
    const { passphrase } = req.body;

    if (!passphrase) {
      return res.status(400).json({ error: 'Passphrase is required' });
    }

    const agent = await getAgent({ tenantId });

    // Get vault info for filename (stored in header.metadata)
    const vaultInfo = await agent.modules.vaults.getInfo(vaultId);

    // Decrypt the vault
    const pdfBytes = await agent.modules.vaults.open(vaultId, { passphrase });

    // Set headers for PDF download (metadata is in header.metadata)
    const filename = vaultInfo.header?.metadata?.filename || 'document.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBytes.length);

    // Send the PDF
    res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error('Error downloading PDF:', error);
    if (error.message?.includes('decrypt') || error.message?.includes('passphrase')) {
      return res.status(401).json({
        error: 'Decryption failed',
        message: 'Invalid passphrase or corrupted vault',
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

    // Update the vault status to 'shared'
    const vaultInfo = await agent.modules.vaults.getInfo(vaultId);
    const existingMetadata = vaultInfo.header?.metadata || {};
    await agent.modules.vaults.updateMetadata(vaultId, {
      ...existingMetadata,
      status: 'shared',
      sharedAt: new Date().toISOString(),
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

    // Owner's view
    const pendingToShare = ownedVaults.filter((v: any) => {
      const meta = v.header?.metadata;
      return meta?.status === 'pending_share' || (!meta?.status && !meta?.sharedAt);
    });
    const awaitingSignature = ownedVaults.filter((v: any) => {
      const meta = v.header?.metadata;
      return (meta?.status === 'shared' || meta?.sharedAt) && !meta?.returnedAt;
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
