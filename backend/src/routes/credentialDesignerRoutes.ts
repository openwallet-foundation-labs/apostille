import { Router, Request, Response } from 'express';
import { auth } from '../middleware/authMiddleware';
import {
    createCardTemplate,
    getCardTemplates,
    getCardTemplateById,
    updateCardTemplate,
    deleteCardTemplate,
    duplicateCardTemplate,
    createCardAsset,
    getCardAssets,
    getCardAssetById,
    deleteCardAsset
} from '../db/quries';

const router = Router();

// ============================================
// Template Routes
// ============================================

/**
 * Get all templates for current tenant
 */
router.get('/templates', auth, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user.tenantId;

        if (!tenantId) {
            res.status(400).json({
                success: false,
                message: 'Tenant ID not found in authentication token'
            });
            return;
        }

        const templates = await getCardTemplates(tenantId);

        res.status(200).json({
            success: true,
            templates
        });
    } catch (error: any) {
        console.error('Failed to get card templates:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get card templates'
        });
    }
});

/**
 * Get single template by ID
 */
router.get('/templates/:id', auth, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user.tenantId;
        const { id } = req.params;

        if (!tenantId) {
            res.status(400).json({
                success: false,
                message: 'Tenant ID not found in authentication token'
            });
            return;
        }

        const template = await getCardTemplateById(id, tenantId);

        if (!template) {
            res.status(404).json({
                success: false,
                message: 'Template not found'
            });
            return;
        }

        res.status(200).json({
            success: true,
            template
        });
    } catch (error: any) {
        console.error('Failed to get card template:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get card template'
        });
    }
});

/**
 * Create new template
 */
router.post('/templates', auth, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user.tenantId;
        const {
            name,
            description,
            category,
            craft_state,
            oca_branding,
            oca_meta,
            card_width,
            card_height,
            thumbnail
        } = req.body;

        if (!tenantId) {
            res.status(400).json({
                success: false,
                message: 'Tenant ID not found in authentication token'
            });
            return;
        }

        if (!name || !craft_state) {
            res.status(400).json({
                success: false,
                message: 'Name and craft_state are required'
            });
            return;
        }

        const template = await createCardTemplate({
            tenant_id: tenantId,
            name,
            description,
            category,
            craft_state,
            oca_branding,
            oca_meta,
            card_width,
            card_height,
            thumbnail
        });

        res.status(201).json({
            success: true,
            template
        });
    } catch (error: any) {
        console.error('Failed to create card template:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create card template'
        });
    }
});

/**
 * Update template
 */
router.put('/templates/:id', auth, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user.tenantId;
        const { id } = req.params;
        const updates = req.body;

        if (!tenantId) {
            res.status(400).json({
                success: false,
                message: 'Tenant ID not found in authentication token'
            });
            return;
        }

        const template = await updateCardTemplate(id, tenantId, updates);

        if (!template) {
            res.status(404).json({
                success: false,
                message: 'Template not found'
            });
            return;
        }

        res.status(200).json({
            success: true,
            template
        });
    } catch (error: any) {
        console.error('Failed to update card template:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update card template'
        });
    }
});

/**
 * Delete template
 */
router.delete('/templates/:id', auth, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user.tenantId;
        const { id } = req.params;

        if (!tenantId) {
            res.status(400).json({
                success: false,
                message: 'Tenant ID not found in authentication token'
            });
            return;
        }

        const deleted = await deleteCardTemplate(id, tenantId);

        if (!deleted) {
            res.status(404).json({
                success: false,
                message: 'Template not found'
            });
            return;
        }

        res.status(200).json({
            success: true,
            message: 'Template deleted successfully'
        });
    } catch (error: any) {
        console.error('Failed to delete card template:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete card template'
        });
    }
});

/**
 * Duplicate template
 */
router.post('/templates/:id/duplicate', auth, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user.tenantId;
        const { id } = req.params;
        const { name } = req.body;

        if (!tenantId) {
            res.status(400).json({
                success: false,
                message: 'Tenant ID not found in authentication token'
            });
            return;
        }

        const newName = name || `Copy of template`;
        const template = await duplicateCardTemplate(id, tenantId, newName);

        if (!template) {
            res.status(404).json({
                success: false,
                message: 'Template not found'
            });
            return;
        }

        res.status(201).json({
            success: true,
            template
        });
    } catch (error: any) {
        console.error('Failed to duplicate card template:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to duplicate card template'
        });
    }
});

/**
 * Export template to OCA format
 */
router.post('/templates/:id/export-oca', auth, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user.tenantId;
        const { id } = req.params;

        if (!tenantId) {
            res.status(400).json({
                success: false,
                message: 'Tenant ID not found in authentication token'
            });
            return;
        }

        const template = await getCardTemplateById(id, tenantId);

        if (!template) {
            res.status(404).json({
                success: false,
                message: 'Template not found'
            });
            return;
        }

        // Return the OCA overlay data
        const overlay = {
            meta: template.oca_meta || {},
            branding: template.oca_branding || {}
        };

        res.status(200).json({
            success: true,
            overlay
        });
    } catch (error: any) {
        console.error('Failed to export OCA:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to export OCA'
        });
    }
});

/**
 * Get preset templates (static presets from codebase)
 */
router.get('/presets', auth, async (req: Request, res: Response) => {
    try {
        // Import presets from static files
        const presets = getStaticPresets();

        res.status(200).json({
            success: true,
            presets
        });
    } catch (error: any) {
        console.error('Failed to get presets:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get presets'
        });
    }
});

// ============================================
// Asset Routes
// ============================================

/**
 * Get all assets for current tenant
 */
router.get('/assets', auth, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user.tenantId;
        const { template_id } = req.query;

        if (!tenantId) {
            res.status(400).json({
                success: false,
                message: 'Tenant ID not found in authentication token'
            });
            return;
        }

        const assets = await getCardAssets(tenantId, template_id as string | undefined);

        res.status(200).json({
            success: true,
            assets
        });
    } catch (error: any) {
        console.error('Failed to get card assets:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get card assets'
        });
    }
});

/**
 * Get single asset by ID
 */
router.get('/assets/:id', auth, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user.tenantId;
        const { id } = req.params;

        if (!tenantId) {
            res.status(400).json({
                success: false,
                message: 'Tenant ID not found in authentication token'
            });
            return;
        }

        const asset = await getCardAssetById(id, tenantId);

        if (!asset) {
            res.status(404).json({
                success: false,
                message: 'Asset not found'
            });
            return;
        }

        res.status(200).json({
            success: true,
            asset
        });
    } catch (error: any) {
        console.error('Failed to get card asset:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get card asset'
        });
    }
});

/**
 * Upload new asset (base64)
 */
router.post('/assets', auth, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user.tenantId;
        const {
            template_id,
            asset_type,
            file_name,
            mime_type,
            content,
            width,
            height
        } = req.body;

        if (!tenantId) {
            res.status(400).json({
                success: false,
                message: 'Tenant ID not found in authentication token'
            });
            return;
        }

        if (!asset_type || !file_name || !mime_type || !content) {
            res.status(400).json({
                success: false,
                message: 'asset_type, file_name, mime_type, and content are required'
            });
            return;
        }

        // Validate mime type
        const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml', 'image/webp'];
        if (!allowedMimeTypes.includes(mime_type)) {
            res.status(400).json({
                success: false,
                message: 'Invalid mime type. Allowed: ' + allowedMimeTypes.join(', ')
            });
            return;
        }

        // Validate content size (max 2MB base64)
        const maxSize = 2 * 1024 * 1024 * 1.37; // ~2MB in base64
        if (content.length > maxSize) {
            res.status(400).json({
                success: false,
                message: 'File too large. Maximum size is 2MB'
            });
            return;
        }

        const asset = await createCardAsset({
            tenant_id: tenantId,
            template_id,
            asset_type,
            file_name,
            mime_type,
            content,
            width,
            height
        });

        // Generate public URL for the asset
        const publicUrl = `${process.env.PUBLIC_URL || process.env.API_URL || 'http://localhost:3002'}/api/credential-designer/assets/${asset.id}/image`;

        res.status(201).json({
            success: true,
            asset: {
                ...asset,
                public_url: publicUrl
            }
        });
    } catch (error: any) {
        console.error('Failed to create card asset:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create card asset'
        });
    }
});

/**
 * PUBLIC: Serve asset image by ID (no auth required for wallet display)
 * Returns the actual image file with proper content-type
 * URL format: /api/credential-designer/assets/:id/image
 */
router.get('/assets/:id/image', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Get asset without tenant check (public endpoint)
        const { db } = require('../db/driver');
        const result = await db.query(
            `SELECT content, mime_type, file_name FROM credential_card_assets WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                message: 'Asset not found'
            });
            return;
        }

        const asset = result.rows[0];
        const content = asset.content;

        // Check if content is a data URL (base64)
        if (content.startsWith('data:')) {
            // Extract base64 data from data URL
            const matches = content.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
                const mimeType = matches[1];
                const base64Data = matches[2];
                const buffer = Buffer.from(base64Data, 'base64');

                // Set cache headers (1 year for immutable assets)
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                res.setHeader('Content-Type', mimeType);
                res.setHeader('Content-Length', buffer.length);
                res.send(buffer);
                return;
            }
        }

        // If not a data URL, assume it's already base64 without prefix
        const buffer = Buffer.from(content, 'base64');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Content-Type', asset.mime_type || 'image/png');
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);
    } catch (error: any) {
        console.error('Failed to serve asset image:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to serve asset'
        });
    }
});

/**
 * Delete asset
 */
router.delete('/assets/:id', auth, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user.tenantId;
        const { id } = req.params;

        if (!tenantId) {
            res.status(400).json({
                success: false,
                message: 'Tenant ID not found in authentication token'
            });
            return;
        }

        const deleted = await deleteCardAsset(id, tenantId);

        if (!deleted) {
            res.status(404).json({
                success: false,
                message: 'Asset not found'
            });
            return;
        }

        res.status(200).json({
            success: true,
            message: 'Asset deleted successfully'
        });
    } catch (error: any) {
        console.error('Failed to delete card asset:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete card asset'
        });
    }
});

// ============================================
// Static Presets
// ============================================

interface PresetTemplate {
    id: string;
    name: string;
    description: string;
    category: string;
    thumbnail: string;
    craft_state: Record<string, unknown>;
    oca_branding: Record<string, unknown>;
    oca_meta: Record<string, unknown>;
}

function getStaticPresets(): PresetTemplate[] {
    return [
        // Education Presets
        {
            id: 'preset-university-degree',
            name: 'University Degree',
            description: 'Classic university degree certificate design',
            category: 'education',
            thumbnail: '',
            craft_state: createEducationPreset('#1e3a5f', '#0f1f33'),
            oca_branding: {
                primary_background_color: '#1e3a5f',
                secondary_background_color: '#0f1f33'
            },
            oca_meta: {
                name: 'University Degree',
                description: 'Academic credential'
            }
        },
        {
            id: 'preset-student-id',
            name: 'Student ID Card',
            description: 'Modern student identification card',
            category: 'education',
            thumbnail: '',
            craft_state: createEducationPreset('#2563eb', '#1d4ed8'),
            oca_branding: {
                primary_background_color: '#2563eb',
                secondary_background_color: '#1d4ed8'
            },
            oca_meta: {
                name: 'Student ID',
                description: 'Student identification'
            }
        },
        {
            id: 'preset-course-certificate',
            name: 'Course Certificate',
            description: 'Professional course completion certificate',
            category: 'education',
            thumbnail: '',
            craft_state: createEducationPreset('#059669', '#047857'),
            oca_branding: {
                primary_background_color: '#059669',
                secondary_background_color: '#047857'
            },
            oca_meta: {
                name: 'Course Certificate',
                description: 'Course completion credential'
            }
        },
        // Professional Presets
        {
            id: 'preset-employee-badge',
            name: 'Employee Badge',
            description: 'Corporate employee identification badge',
            category: 'professional',
            thumbnail: '',
            craft_state: createProfessionalPreset('#374151', '#1f2937'),
            oca_branding: {
                primary_background_color: '#374151',
                secondary_background_color: '#1f2937'
            },
            oca_meta: {
                name: 'Employee Badge',
                description: 'Employee identification'
            }
        },
        {
            id: 'preset-professional-license',
            name: 'Professional License',
            description: 'Official professional license credential',
            category: 'professional',
            thumbnail: '',
            craft_state: createProfessionalPreset('#7c3aed', '#6d28d9'),
            oca_branding: {
                primary_background_color: '#7c3aed',
                secondary_background_color: '#6d28d9'
            },
            oca_meta: {
                name: 'Professional License',
                description: 'Licensed professional credential'
            }
        },
        // Membership Presets
        {
            id: 'preset-membership-card',
            name: 'Membership Card',
            description: 'Club or organization membership card',
            category: 'membership',
            thumbnail: '',
            craft_state: createMembershipPreset('#dc2626', '#b91c1c'),
            oca_branding: {
                primary_background_color: '#dc2626',
                secondary_background_color: '#b91c1c'
            },
            oca_meta: {
                name: 'Membership Card',
                description: 'Organization membership'
            }
        },
        {
            id: 'preset-vip-pass',
            name: 'VIP Pass',
            description: 'Premium VIP access pass',
            category: 'membership',
            thumbnail: '',
            craft_state: createMembershipPreset('#f59e0b', '#d97706'),
            oca_branding: {
                primary_background_color: '#f59e0b',
                secondary_background_color: '#d97706'
            },
            oca_meta: {
                name: 'VIP Pass',
                description: 'VIP access credential'
            }
        }
    ];
}

function createEducationPreset(primaryColor: string, secondaryColor: string): Record<string, unknown> {
    return {
        ROOT: {
            type: { resolvedName: 'CardContainer' },
            isCanvas: true,
            props: {
                backgroundColor: primaryColor,
                backgroundGradient: {
                    type: 'linear',
                    colors: [primaryColor, secondaryColor],
                    angle: 135
                },
                borderRadius: 12,
                padding: 20,
                shadow: 'lg'
            },
            displayName: 'Card',
            custom: {},
            hidden: false,
            nodes: ['logo', 'issuerName', 'holderName', 'credentialType'],
            linkedNodes: {}
        },
        logo: {
            type: { resolvedName: 'ImageNode' },
            isCanvas: false,
            props: {
                src: '',
                width: 60,
                height: 60,
                borderRadius: 8,
                role: 'logo',
                x: 20,
                y: 20
            },
            displayName: 'Logo',
            custom: {},
            parent: 'ROOT',
            hidden: false,
            nodes: [],
            linkedNodes: {}
        },
        issuerName: {
            type: { resolvedName: 'TextNode' },
            isCanvas: false,
            props: {
                text: 'Institution Name',
                fontSize: 14,
                fontWeight: 'semibold',
                color: '#ffffff',
                textAlign: 'left',
                x: 90,
                y: 20,
                isMetaField: true,
                metaKey: 'issuer'
            },
            displayName: 'Issuer',
            custom: {},
            parent: 'ROOT',
            hidden: false,
            nodes: [],
            linkedNodes: {}
        },
        holderName: {
            type: { resolvedName: 'AttributeNode' },
            isCanvas: false,
            props: {
                attributeName: 'name',
                role: 'primary',
                fontSize: 20,
                fontWeight: 'bold',
                color: '#ffffff',
                x: 20,
                y: 100
            },
            displayName: 'Holder Name',
            custom: {},
            parent: 'ROOT',
            hidden: false,
            nodes: [],
            linkedNodes: {}
        },
        credentialType: {
            type: { resolvedName: 'AttributeNode' },
            isCanvas: false,
            props: {
                attributeName: 'degree',
                role: 'secondary',
                fontSize: 14,
                fontWeight: 'normal',
                color: '#e2e8f0',
                x: 20,
                y: 130
            },
            displayName: 'Credential Type',
            custom: {},
            parent: 'ROOT',
            hidden: false,
            nodes: [],
            linkedNodes: {}
        }
    };
}

function createProfessionalPreset(primaryColor: string, secondaryColor: string): Record<string, unknown> {
    return {
        ROOT: {
            type: { resolvedName: 'CardContainer' },
            isCanvas: true,
            props: {
                backgroundColor: primaryColor,
                backgroundGradient: {
                    type: 'linear',
                    colors: [primaryColor, secondaryColor],
                    angle: 180
                },
                borderRadius: 8,
                padding: 16,
                shadow: 'md'
            },
            displayName: 'Card',
            custom: {},
            hidden: false,
            nodes: ['logo', 'companyName', 'employeeName', 'title'],
            linkedNodes: {}
        },
        logo: {
            type: { resolvedName: 'ImageNode' },
            isCanvas: false,
            props: {
                src: '',
                width: 50,
                height: 50,
                borderRadius: 4,
                role: 'logo',
                x: 16,
                y: 16
            },
            displayName: 'Logo',
            custom: {},
            parent: 'ROOT',
            hidden: false,
            nodes: [],
            linkedNodes: {}
        },
        companyName: {
            type: { resolvedName: 'TextNode' },
            isCanvas: false,
            props: {
                text: 'Company Name',
                fontSize: 12,
                fontWeight: 'medium',
                color: '#ffffff',
                textAlign: 'right',
                x: 200,
                y: 16,
                isMetaField: true,
                metaKey: 'issuer'
            },
            displayName: 'Company',
            custom: {},
            parent: 'ROOT',
            hidden: false,
            nodes: [],
            linkedNodes: {}
        },
        employeeName: {
            type: { resolvedName: 'AttributeNode' },
            isCanvas: false,
            props: {
                attributeName: 'name',
                role: 'primary',
                fontSize: 18,
                fontWeight: 'bold',
                color: '#ffffff',
                x: 16,
                y: 90
            },
            displayName: 'Employee Name',
            custom: {},
            parent: 'ROOT',
            hidden: false,
            nodes: [],
            linkedNodes: {}
        },
        title: {
            type: { resolvedName: 'AttributeNode' },
            isCanvas: false,
            props: {
                attributeName: 'title',
                role: 'secondary',
                fontSize: 12,
                fontWeight: 'normal',
                color: '#d1d5db',
                x: 16,
                y: 115
            },
            displayName: 'Title',
            custom: {},
            parent: 'ROOT',
            hidden: false,
            nodes: [],
            linkedNodes: {}
        }
    };
}

function createMembershipPreset(primaryColor: string, secondaryColor: string): Record<string, unknown> {
    return {
        ROOT: {
            type: { resolvedName: 'CardContainer' },
            isCanvas: true,
            props: {
                backgroundColor: primaryColor,
                backgroundGradient: {
                    type: 'radial',
                    colors: [primaryColor, secondaryColor]
                },
                borderRadius: 16,
                padding: 20,
                shadow: 'xl'
            },
            displayName: 'Card',
            custom: {},
            hidden: false,
            nodes: ['logo', 'clubName', 'memberName', 'membershipLevel'],
            linkedNodes: {}
        },
        logo: {
            type: { resolvedName: 'ImageNode' },
            isCanvas: false,
            props: {
                src: '',
                width: 70,
                height: 70,
                borderRadius: 35,
                role: 'logo',
                x: 135,
                y: 20
            },
            displayName: 'Logo',
            custom: {},
            parent: 'ROOT',
            hidden: false,
            nodes: [],
            linkedNodes: {}
        },
        clubName: {
            type: { resolvedName: 'TextNode' },
            isCanvas: false,
            props: {
                text: 'Club Name',
                fontSize: 16,
                fontWeight: 'bold',
                color: '#ffffff',
                textAlign: 'center',
                x: 0,
                y: 100,
                isMetaField: true,
                metaKey: 'issuer'
            },
            displayName: 'Club',
            custom: {},
            parent: 'ROOT',
            hidden: false,
            nodes: [],
            linkedNodes: {}
        },
        memberName: {
            type: { resolvedName: 'AttributeNode' },
            isCanvas: false,
            props: {
                attributeName: 'name',
                role: 'primary',
                fontSize: 18,
                fontWeight: 'semibold',
                color: '#ffffff',
                textAlign: 'center',
                x: 0,
                y: 140
            },
            displayName: 'Member Name',
            custom: {},
            parent: 'ROOT',
            hidden: false,
            nodes: [],
            linkedNodes: {}
        },
        membershipLevel: {
            type: { resolvedName: 'AttributeNode' },
            isCanvas: false,
            props: {
                attributeName: 'level',
                role: 'secondary',
                fontSize: 12,
                fontWeight: 'medium',
                color: '#fef3c7',
                textAlign: 'center',
                x: 0,
                y: 165
            },
            displayName: 'Level',
            custom: {},
            parent: 'ROOT',
            hidden: false,
            nodes: [],
            linkedNodes: {}
        }
    };
}

export default router;
