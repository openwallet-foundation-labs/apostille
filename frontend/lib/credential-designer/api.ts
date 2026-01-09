import {
  CardTemplate,
  CardAsset,
  PresetTemplate,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  UploadAssetRequest,
  OCAOverlay,
} from './types';
import runtimeConfig from '../runtimeConfig';
import { getAccessToken } from '../auth/tokenStore';

const API_BASE_URL = runtimeConfig.API_URL;

/**
 * Fetch with authentication
 * Security: Uses in-memory token from tokenStore instead of localStorage
 */
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? getAccessToken() : null;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Send httpOnly cookies
  });

  if (response.status === 401) {
    // Dispatch auth error event for global handling
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('authError'));
    }
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || 'Request failed');
  }

  return response.json();
}

// ============================================
// Template API
// ============================================

export const credentialDesignerApi = {
  // Get all templates for current tenant
  async getTemplates(): Promise<{ success: boolean; templates: CardTemplate[] }> {
    return fetchWithAuth(`${API_BASE_URL}/api/credential-designer/templates`);
  },

  // Get single template by ID
  async getTemplate(id: string): Promise<{ success: boolean; template: CardTemplate }> {
    return fetchWithAuth(`${API_BASE_URL}/api/credential-designer/templates/${id}`);
  },

  // Create new template
  async createTemplate(data: CreateTemplateRequest): Promise<{ success: boolean; template: CardTemplate }> {
    return fetchWithAuth(`${API_BASE_URL}/api/credential-designer/templates`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update template
  async updateTemplate(id: string, data: UpdateTemplateRequest): Promise<{ success: boolean; template: CardTemplate }> {
    return fetchWithAuth(`${API_BASE_URL}/api/credential-designer/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Delete template
  async deleteTemplate(id: string): Promise<{ success: boolean; message: string }> {
    return fetchWithAuth(`${API_BASE_URL}/api/credential-designer/templates/${id}`, {
      method: 'DELETE',
    });
  },

  // Duplicate template
  async duplicateTemplate(id: string, name?: string): Promise<{ success: boolean; template: CardTemplate }> {
    return fetchWithAuth(`${API_BASE_URL}/api/credential-designer/templates/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  // Export template to OCA format
  async exportToOCA(id: string): Promise<{ success: boolean; overlay: OCAOverlay }> {
    return fetchWithAuth(`${API_BASE_URL}/api/credential-designer/templates/${id}/export-oca`, {
      method: 'POST',
    });
  },

  // Get preset templates
  async getPresets(): Promise<{ success: boolean; presets: PresetTemplate[] }> {
    return fetchWithAuth(`${API_BASE_URL}/api/credential-designer/presets`);
  },

  // ============================================
  // Asset API
  // ============================================

  // Get all assets for current tenant
  async getAssets(templateId?: string): Promise<{ success: boolean; assets: CardAsset[] }> {
    const url = templateId
      ? `${API_BASE_URL}/api/credential-designer/assets?template_id=${templateId}`
      : `${API_BASE_URL}/api/credential-designer/assets`;
    return fetchWithAuth(url);
  },

  // Get single asset by ID
  async getAsset(id: string): Promise<{ success: boolean; asset: CardAsset }> {
    return fetchWithAuth(`${API_BASE_URL}/api/credential-designer/assets/${id}`);
  },

  // Upload new asset
  async uploadAsset(data: UploadAssetRequest): Promise<{ success: boolean; asset: CardAsset }> {
    return fetchWithAuth(`${API_BASE_URL}/api/credential-designer/assets`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Delete asset
  async deleteAsset(id: string): Promise<{ success: boolean; message: string }> {
    return fetchWithAuth(`${API_BASE_URL}/api/credential-designer/assets/${id}`, {
      method: 'DELETE',
    });
  },

  // Helper: Upload file as base64
  async uploadFile(
    file: File,
    assetType: 'logo' | 'background' | 'icon' | 'decoration',
    templateId?: string
  ): Promise<{ success: boolean; asset: CardAsset }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async () => {
        try {
          const base64 = reader.result as string;

          // Get image dimensions
          const img = new Image();
          img.onload = async () => {
            const result = await this.uploadAsset({
              template_id: templateId,
              asset_type: assetType,
              file_name: file.name,
              mime_type: file.type,
              content: base64,
              width: img.width,
              height: img.height,
            });
            resolve(result);
          };
          img.onerror = () => {
            // Still upload even if we can't get dimensions (e.g., SVG)
            this.uploadAsset({
              template_id: templateId,
              asset_type: assetType,
              file_name: file.name,
              mime_type: file.type,
              content: base64,
            }).then(resolve).catch(reject);
          };
          img.src = base64;
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  },
};

export default credentialDesignerApi;
