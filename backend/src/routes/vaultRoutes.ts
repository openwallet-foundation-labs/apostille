import { Router, Request, Response } from 'express';
import { getAgent } from '../services/agentService';
import multer from 'multer';

const router = Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  },
});

/**
 * List all vaults
 * GET /api/vaults
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const agent = await getAgent({ tenantId });

    const vaults = await agent.modules.vaults.list();

    res.json({
      success: true,
      vaults: vaults.map((vault: any) => ({
        id: vault.id,
        vaultId: vault.vaultId,
        docId: vault.docId,
        ownerId: vault.ownerId,
        storageUri: vault.storageUri,
        metadata: vault.metadata,
        createdAt: vault.createdAt,
        updatedAt: vault.updatedAt,
      })),
    });
  } catch (error: any) {
    console.error('Error listing vaults:', error);
    res.status(500).json({
      error: 'Failed to list vaults',
      message: error.message,
    });
  }
});

/**
 * Get vault info
 * GET /api/vaults/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { id } = req.params;
    const agent = await getAgent({ tenantId });

    const info = await agent.modules.vaults.getInfo(id);

    res.json({
      success: true,
      vault: info,
    });
  } catch (error: any) {
    console.error('Error getting vault info:', error);
    if (error.message?.includes('not found')) {
      return res.status(404).json({
        error: 'Vault not found',
        message: error.message,
      });
    }
    res.status(500).json({
      error: 'Failed to get vault info',
      message: error.message,
    });
  }
});

/**
 * Create a new vault (with file upload)
 * POST /api/vaults
 * Body: multipart/form-data with 'file' and 'passphrase'
 */
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { passphrase, description } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'File is required' });
    }

    if (!passphrase) {
      return res.status(400).json({ error: 'Passphrase is required' });
    }

    const agent = await getAgent({ tenantId });

    // Convert buffer to Uint8Array
    const data = new Uint8Array(file.buffer);

    const result = await agent.modules.vaults.create(data, {
      passphrase,
      metadata: {
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        description: description || undefined,
      },
    });

    res.json({
      success: true,
      vault: {
        vaultId: result.vaultId,
        docId: result.docId,
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      },
    });
  } catch (error: any) {
    console.error('Error creating vault:', error);
    res.status(500).json({
      error: 'Failed to create vault',
      message: error.message,
    });
  }
});

/**
 * Delete a vault
 * DELETE /api/vaults/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { id } = req.params;
    const agent = await getAgent({ tenantId });

    await agent.modules.vaults.delete(id);

    res.json({
      success: true,
      message: 'Vault deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting vault:', error);
    if (error.message?.includes('not found')) {
      return res.status(404).json({
        error: 'Vault not found',
        message: error.message,
      });
    }
    res.status(500).json({
      error: 'Failed to delete vault',
      message: error.message,
    });
  }
});

/**
 * Open (decrypt) a vault
 * POST /api/vaults/:id/open
 * Body: { passphrase: string }
 */
router.post('/:id/open', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { id } = req.params;
    const { passphrase } = req.body;

    if (!passphrase) {
      return res.status(400).json({ error: 'Passphrase is required' });
    }

    const agent = await getAgent({ tenantId });

    // Get vault info first for metadata
    const info = await agent.modules.vaults.getInfo(id);

    // Decrypt the vault
    const data = await agent.modules.vaults.open(id, { passphrase });

    // Return the decrypted data as base64
    res.json({
      success: true,
      data: Buffer.from(data).toString('base64'),
      metadata: info.metadata,
    });
  } catch (error: any) {
    console.error('Error opening vault:', error);
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
      error: 'Failed to open vault',
      message: error.message,
    });
  }
});

/**
 * Update vault with new data
 * PUT /api/vaults/:id
 * Body: multipart/form-data with 'file' and 'passphrase'
 */
router.put('/:id', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { id } = req.params;
    const { passphrase, description } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'File is required' });
    }

    if (!passphrase) {
      return res.status(400).json({ error: 'Passphrase is required' });
    }

    const agent = await getAgent({ tenantId });

    // Convert buffer to Uint8Array
    const data = new Uint8Array(file.buffer);

    await agent.modules.vaults.update(id, data, {
      passphrase,
      metadata: {
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        description: description || undefined,
      },
    });

    res.json({
      success: true,
      message: 'Vault updated successfully',
      vault: {
        vaultId: id,
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      },
    });
  } catch (error: any) {
    console.error('Error updating vault:', error);
    if (error.message?.includes('not found')) {
      return res.status(404).json({
        error: 'Vault not found',
        message: error.message,
      });
    }
    res.status(500).json({
      error: 'Failed to update vault',
      message: error.message,
    });
  }
});

/**
 * Share vault with a connection (via DIDComm)
 * POST /api/vaults/:id/share
 * Body: { connectionId: string }
 */
router.post('/:id/share', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { id } = req.params;
    const { connectionId } = req.body;

    if (!connectionId) {
      return res.status(400).json({ error: 'connectionId is required' });
    }

    const agent = await getAgent({ tenantId });

    // Share the signing vault
    await agent.modules.vaults.shareSigningVault(id, connectionId);

    res.json({
      success: true,
      message: 'Vault shared successfully',
    });
  } catch (error: any) {
    console.error('Error sharing vault:', error);
    if (error.message?.includes('not found')) {
      return res.status(404).json({
        error: 'Vault or connection not found',
        message: error.message,
      });
    }
    res.status(500).json({
      error: 'Failed to share vault',
      message: error.message,
    });
  }
});

/**
 * Configure S3 storage for vaults (admin only)
 * POST /api/vaults/storage/configure
 * Body: S3StorageConfig
 */
router.post('/storage/configure', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const { bucket, region, accessKeyId, secretAccessKey, endpoint } = req.body;

    if (!bucket || !region || !accessKeyId || !secretAccessKey) {
      return res.status(400).json({
        error: 'Missing required fields: bucket, region, accessKeyId, secretAccessKey',
      });
    }

    const agent = await getAgent({ tenantId });

    await agent.modules.vaults.configureStorage({
      type: 's3',
      bucket,
      region,
      accessKeyId,
      secretAccessKey,
      endpoint: endpoint || undefined,
    });

    res.json({
      success: true,
      message: 'Storage configured successfully',
    });
  } catch (error: any) {
    console.error('Error configuring storage:', error);
    res.status(500).json({
      error: 'Failed to configure storage',
      message: error.message,
    });
  }
});

/**
 * Check if storage is configured
 * GET /api/vaults/storage/status
 */
router.get('/storage/status', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const agent = await getAgent({ tenantId });

    const isConfigured = agent.modules.vaults.isStorageConfigured();

    res.json({
      success: true,
      storageConfigured: isConfigured,
    });
  } catch (error: any) {
    console.error('Error checking storage status:', error);
    res.status(500).json({
      error: 'Failed to check storage status',
      message: error.message,
    });
  }
});

/**
 * Generate a new KEM keypair for vault sharing
 * POST /api/vaults/keys/generate
 */
router.post('/keys/generate', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const agent = await getAgent({ tenantId });

    const keypair = agent.modules.vaults.generateKemKeypair();

    // Store the keypair in generic records for later use
    await agent.genericRecords.save({
      content: {
        kid: keypair.kid,
        publicKey: Buffer.from(keypair.publicKey).toString('base64'),
        secretKey: Buffer.from(keypair.secretKey).toString('base64'),
      },
      tags: {
        type: 'VaultKemKey',
        kid: keypair.kid,
      },
    });

    res.json({
      success: true,
      key: {
        kid: keypair.kid,
        publicKey: Buffer.from(keypair.publicKey).toString('base64'),
      },
    });
  } catch (error: any) {
    console.error('Error generating KEM keypair:', error);
    res.status(500).json({
      error: 'Failed to generate KEM keypair',
      message: error.message,
    });
  }
});

/**
 * Get all KEM keys
 * GET /api/vaults/keys
 */
router.get('/keys', async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user;
    const agent = await getAgent({ tenantId });

    const keys = await agent.genericRecords.findAllByQuery({
      type: 'VaultKemKey',
    });

    res.json({
      success: true,
      keys: keys.map((record: any) => ({
        kid: record.content.kid,
        publicKey: record.content.publicKey,
        createdAt: record.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching KEM keys:', error);
    res.status(500).json({
      error: 'Failed to fetch KEM keys',
      message: error.message,
    });
  }
});

export default router;
