import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  CardTemplate,
  CardAsset,
  CraftState,
  OCABranding,
  OCAMeta,
  DEFAULT_CARD_WIDTH,
  DEFAULT_CARD_HEIGHT,
} from './types';
import { credentialDesignerApi } from './api';

interface DesignerStore {
  // State
  currentTemplate: CardTemplate | null;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  // Selection
  selectedNodeId: string | null;

  // View options
  zoom: number;
  showGrid: boolean;
  previewMode: boolean;

  // Schema context
  availableAttributes: string[];
  schemaId: string | null;

  // UI
  sidebarTab: 'components' | 'templates' | 'assets';

  // Assets
  uploadedAssets: CardAsset[];

  // Actions
  // Template management
  loadTemplate: (id: string) => Promise<void>;
  createNewTemplate: (name: string, category?: string) => void;
  createFromPreset: (presetCraftState: CraftState, name: string, category?: string) => void;
  saveTemplate: () => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  duplicateTemplate: () => Promise<void>;

  // Craft state updates
  updateCraftState: (craftState: CraftState, templateId?: string) => void;
  updateOCABranding: (branding: OCABranding) => void;
  updateOCAMeta: (meta: OCAMeta) => void;
  updateTemplateName: (name: string) => void;
  updateTemplateDescription: (description: string) => void;
  updateTemplateCategory: (category: string) => void;
  updateCardDimensions: (width: number, height: number) => void;
  updateThumbnail: (thumbnail: string) => void;

  // Selection
  setSelectedNode: (nodeId: string | null) => void;

  // View options
  setZoom: (zoom: number) => void;
  setShowGrid: (show: boolean) => void;
  setPreviewMode: (preview: boolean) => void;

  // Schema context
  setAvailableAttributes: (attributes: string[]) => void;
  setSchemaId: (schemaId: string | null) => void;

  // UI
  setSidebarTab: (tab: 'components' | 'templates' | 'assets') => void;

  // Assets
  loadAssets: () => Promise<void>;
  uploadAsset: (file: File, assetType: 'logo' | 'background' | 'icon' | 'decoration') => Promise<CardAsset>;
  deleteAsset: (id: string) => Promise<void>;

  // State management
  markDirty: () => void;
  markClean: () => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const getDefaultCraftState = (): CraftState => ({
  ROOT: {
    type: { resolvedName: 'CardContainer' },
    isCanvas: true,
    props: {
      backgroundColor: '#1e3a5f',
      backgroundGradient: {
        type: 'linear',
        colors: ['#1e3a5f', '#0f1f33'],
        angle: 135,
      },
      borderRadius: 12,
      padding: 20,
      shadow: 'lg',
    },
    displayName: 'Card',
    custom: {},
    hidden: false,
    nodes: [],
    linkedNodes: {},
  },
});

const initialState = {
  currentTemplate: null,
  isDirty: false,
  isLoading: false,
  isSaving: false,
  error: null,
  selectedNodeId: null,
  zoom: 1,
  showGrid: true,
  previewMode: false,
  availableAttributes: [],
  schemaId: null,
  sidebarTab: 'components' as const,
  uploadedAssets: [],
};

export const useDesignerStore = create<DesignerStore>()(
  immer((set, get) => {
    let loadSeq = 0;
    return ({
    ...initialState,

    // Template management
    loadTemplate: async (id: string) => {
      const requestId = ++loadSeq;
      set((state) => {
        state.isLoading = true;
        state.error = null;
        state.currentTemplate = null;
      });

      try {
        const result = await credentialDesignerApi.getTemplate(id);
        if (requestId !== loadSeq) return;
        set((state) => {
          state.currentTemplate = result.template;
          state.isLoading = false;
          state.isDirty = false;
        });
      } catch (error: any) {
        if (requestId !== loadSeq) return;
        set((state) => {
          state.error = error.message;
          state.isLoading = false;
        });
      }
    },

    createNewTemplate: (name: string, category?: string) => {
      const newTemplate: CardTemplate = {
        id: '', // Will be set by backend
        tenant_id: '',
        name,
        description: null,
        category: category || 'custom',
        craft_state: getDefaultCraftState(),
        oca_branding: null,
        oca_meta: null,
        card_width: DEFAULT_CARD_WIDTH,
        card_height: DEFAULT_CARD_HEIGHT,
        thumbnail: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      set((state) => {
        state.currentTemplate = newTemplate;
        state.isDirty = true;
        state.selectedNodeId = null;
      });
    },

    createFromPreset: (presetCraftState: CraftState, name: string, category?: string) => {
      const newTemplate: CardTemplate = {
        id: '',
        tenant_id: '',
        name,
        description: null,
        category: category || 'custom',
        craft_state: presetCraftState,
        oca_branding: null,
        oca_meta: null,
        card_width: DEFAULT_CARD_WIDTH,
        card_height: DEFAULT_CARD_HEIGHT,
        thumbnail: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      set((state) => {
        state.currentTemplate = newTemplate;
        state.isDirty = true;
        state.selectedNodeId = null;
      });
    },

    saveTemplate: async () => {
      const { currentTemplate } = get();
      if (!currentTemplate) return;

      set((state) => {
        state.isSaving = true;
        state.error = null;
      });

      try {
        let result;
        if (currentTemplate.id) {
          // Update existing
          result = await credentialDesignerApi.updateTemplate(currentTemplate.id, {
            name: currentTemplate.name,
            description: currentTemplate.description || undefined,
            category: currentTemplate.category || undefined,
            craft_state: currentTemplate.craft_state,
            oca_branding: currentTemplate.oca_branding || undefined,
            oca_meta: currentTemplate.oca_meta || undefined,
            card_width: currentTemplate.card_width,
            card_height: currentTemplate.card_height,
            thumbnail: currentTemplate.thumbnail || undefined,
          });
        } else {
          // Create new
          result = await credentialDesignerApi.createTemplate({
            name: currentTemplate.name,
            description: currentTemplate.description || undefined,
            category: currentTemplate.category || undefined,
            craft_state: currentTemplate.craft_state,
            oca_branding: currentTemplate.oca_branding || undefined,
            oca_meta: currentTemplate.oca_meta || undefined,
            card_width: currentTemplate.card_width,
            card_height: currentTemplate.card_height,
            thumbnail: currentTemplate.thumbnail || undefined,
          });
        }

        set((state) => {
          state.currentTemplate = result.template;
          state.isDirty = false;
          state.isSaving = false;
        });
      } catch (error: any) {
        set((state) => {
          state.error = error.message;
          state.isSaving = false;
        });
      }
    },

    deleteTemplate: async (id: string) => {
      set((state) => {
        state.isLoading = true;
        state.error = null;
      });

      try {
        await credentialDesignerApi.deleteTemplate(id);
        set((state) => {
          if (state.currentTemplate?.id === id) {
            state.currentTemplate = null;
          }
          state.isLoading = false;
        });
      } catch (error: any) {
        set((state) => {
          state.error = error.message;
          state.isLoading = false;
        });
      }
    },

    duplicateTemplate: async () => {
      const { currentTemplate } = get();
      if (!currentTemplate?.id) return;

      set((state) => {
        state.isLoading = true;
        state.error = null;
      });

      try {
        const result = await credentialDesignerApi.duplicateTemplate(
          currentTemplate.id,
          `${currentTemplate.name} (Copy)`
        );
        set((state) => {
          state.currentTemplate = result.template;
          state.isLoading = false;
          state.isDirty = false;
        });
      } catch (error: any) {
        set((state) => {
          state.error = error.message;
          state.isLoading = false;
        });
      }
    },

    // Craft state updates
    updateCraftState: (craftState: CraftState, templateId?: string) => {
      set((state) => {
        if (state.currentTemplate) {
          if (templateId && state.currentTemplate.id !== templateId) {
            return;
          }
          state.currentTemplate.craft_state = craftState;
          state.isDirty = true;
        }
      });
    },

    updateOCABranding: (branding: OCABranding) => {
      set((state) => {
        if (state.currentTemplate) {
          state.currentTemplate.oca_branding = {
            ...state.currentTemplate.oca_branding,
            ...branding,
          };
          state.isDirty = true;
        }
      });
    },

    updateOCAMeta: (meta: OCAMeta) => {
      set((state) => {
        if (state.currentTemplate) {
          state.currentTemplate.oca_meta = {
            ...state.currentTemplate.oca_meta,
            ...meta,
          };
          state.isDirty = true;
        }
      });
    },

    updateTemplateName: (name: string) => {
      set((state) => {
        if (state.currentTemplate) {
          state.currentTemplate.name = name;
          state.isDirty = true;
        }
      });
    },

    updateTemplateDescription: (description: string) => {
      set((state) => {
        if (state.currentTemplate) {
          state.currentTemplate.description = description;
          state.isDirty = true;
        }
      });
    },

    updateTemplateCategory: (category: string) => {
      set((state) => {
        if (state.currentTemplate) {
          state.currentTemplate.category = category;
          state.isDirty = true;
        }
      });
    },

    updateCardDimensions: (width: number, height: number) => {
      set((state) => {
        if (state.currentTemplate) {
          state.currentTemplate.card_width = width;
          state.currentTemplate.card_height = height;
          state.isDirty = true;
        }
      });
    },

    updateThumbnail: (thumbnail: string) => {
      set((state) => {
        if (state.currentTemplate) {
          state.currentTemplate.thumbnail = thumbnail;
          state.isDirty = true;
        }
      });
    },

    // Selection
    setSelectedNode: (nodeId: string | null) => {
      set((state) => {
        state.selectedNodeId = nodeId;
      });
    },

    // View options
    setZoom: (zoom: number) => {
      set((state) => {
        state.zoom = Math.max(0.25, Math.min(2, zoom));
      });
    },

    setShowGrid: (show: boolean) => {
      set((state) => {
        state.showGrid = show;
      });
    },

    setPreviewMode: (preview: boolean) => {
      set((state) => {
        state.previewMode = preview;
        if (preview) {
          state.selectedNodeId = null;
        }
      });
    },

    // Schema context
    setAvailableAttributes: (attributes: string[]) => {
      set((state) => {
        state.availableAttributes = attributes;
      });
    },

    setSchemaId: (schemaId: string | null) => {
      set((state) => {
        state.schemaId = schemaId;
      });
    },

    // UI
    setSidebarTab: (tab: 'components' | 'templates' | 'assets') => {
      set((state) => {
        state.sidebarTab = tab;
      });
    },

    // Assets
    loadAssets: async () => {
      try {
        const result = await credentialDesignerApi.getAssets();
        set((state) => {
          state.uploadedAssets = result.assets;
        });
      } catch (error: any) {
        set((state) => {
          state.error = error.message;
        });
      }
    },

    uploadAsset: async (file: File, assetType: 'logo' | 'background' | 'icon' | 'decoration') => {
      const { currentTemplate } = get();
      const result = await credentialDesignerApi.uploadFile(
        file,
        assetType,
        currentTemplate?.id
      );

      set((state) => {
        state.uploadedAssets.push(result.asset);
      });

      return result.asset;
    },

    deleteAsset: async (id: string) => {
      await credentialDesignerApi.deleteAsset(id);
      set((state) => {
        state.uploadedAssets = state.uploadedAssets.filter((a) => a.id !== id);
      });
    },

    // State management
    markDirty: () => {
      set((state) => {
        state.isDirty = true;
      });
    },

    markClean: () => {
      set((state) => {
        state.isDirty = false;
      });
    },

    setError: (error: string | null) => {
      set((state) => {
        state.error = error;
      });
    },

    reset: () => {
      set(initialState);
    },
  })})
);

export default useDesignerStore;
