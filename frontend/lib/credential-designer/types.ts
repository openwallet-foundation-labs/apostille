// ============================================
// Credential Designer Types
// ============================================

export interface CardTemplate {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  category: string | null;
  craft_state: CraftState;
  oca_branding: OCABranding | null;
  oca_meta: OCAMeta | null;
  card_width: number;
  card_height: number;
  thumbnail: string | null;
  created_at: string;
  updated_at: string;
}

export interface CardAsset {
  id: string;
  tenant_id: string;
  template_id: string | null;
  asset_type: 'logo' | 'background' | 'icon' | 'decoration';
  file_name: string;
  mime_type: string;
  content: string; // base64
  public_url?: string; // Public URL for serving the image (use this in OCA instead of base64)
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface PresetTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  thumbnail: string;
  craft_state: CraftState;
  oca_branding: OCABranding;
  oca_meta: OCAMeta;
}

// OCA Types (matching existing overlay structure)
export interface OCABranding {
  primary_background_color?: string;
  secondary_background_color?: string;
  primary_attribute?: string;
  secondary_attribute?: string;
  logo?: string;
  background_image?: string;
  background_image_slice?: string;
  issued_date_attribute?: string;
  expiry_date_attribute?: string;
  svg_template_url?: string;
  svg_bindings?: Record<string, string>;
}

export interface OCAMeta {
  name?: string;
  description?: string;
  issuer?: string;
  issuer_url?: string;
  issuer_description?: string;
}

export interface OCAOverlay {
  meta?: OCAMeta;
  branding?: OCABranding;
}

// Craft.js Types
export interface CraftState {
  ROOT: CraftNode;
  [nodeId: string]: CraftNode;
}

export interface CraftNode {
  type: { resolvedName: string };
  isCanvas?: boolean;
  props: Record<string, unknown>;
  displayName?: string;
  custom?: Record<string, unknown>;
  parent?: string;
  hidden?: boolean;
  nodes?: string[];
  linkedNodes?: Record<string, string>;
}

// Node Props Types
export interface CardContainerProps {
  backgroundColor: string;
  backgroundGradient?: {
    type: 'linear' | 'radial';
    colors: string[];
    angle?: number;
  };
  backgroundImage?: string; // URL or base64 image
  backgroundImageOpacity?: number;
  backgroundImageFit?: 'cover' | 'contain' | 'fill';
  borderRadius: number;
  padding: number;
  shadow: 'none' | 'sm' | 'md' | 'lg' | 'xl';
}

export interface TextNodeProps {
  text: string;
  fontSize: number;
  fontWeight: 'normal' | 'medium' | 'semibold' | 'bold';
  fontFamily: string;
  color: string;
  textAlign: 'left' | 'center' | 'right';
  letterSpacing: number;
  lineHeight: number;
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  x: number;
  y: number;
  width?: number;
  isMetaField?: boolean;
  metaKey?: keyof OCAMeta;
}

export interface ImageNodeProps {
  src: string; // Can be base64 data URL or public URL
  assetId?: string; // Reference to uploaded asset (for generating public URL)
  publicUrl?: string; // Public URL for the image (preferred for OCA)
  width: number;
  height: number;
  borderRadius: number;
  opacity: number;
  objectFit: 'contain' | 'cover' | 'fill';
  role: 'logo' | 'background' | 'decoration';
  x: number;
  y: number;
}

export interface AttributeNodeProps {
  attributeName: string;
  displayLabel?: string;
  fontSize: number;
  fontWeight: 'normal' | 'medium' | 'semibold' | 'bold';
  color: string;
  role: 'primary' | 'secondary' | 'regular';
  dateRole?: 'issued' | 'expiry' | 'none'; // For date attributes
  showLabel: boolean;
  labelPosition: 'above' | 'inline' | 'below';
  x: number;
  y: number;
  textAlign?: 'left' | 'center' | 'right';
}

export interface ShapeNodeProps {
  shape: 'rectangle' | 'circle' | 'line';
  fill: string;
  stroke: string;
  strokeWidth: number;
  width: number;
  height: number;
  opacity: number;
  x: number;
  y: number;
  borderRadius?: number;
}

export interface DividerNodeProps {
  orientation: 'horizontal' | 'vertical';
  color: string;
  thickness: number;
  length: number;
  x: number;
  y: number;
}

// Designer State
export interface DesignerState {
  currentTemplate: CardTemplate | null;
  isDirty: boolean;
  selectedNodeId: string | null;
  zoom: number;
  showGrid: boolean;
  previewMode: boolean;
  availableAttributes: string[];
  schemaId: string | null;
  sidebarTab: 'components' | 'templates' | 'assets';
  uploadedAssets: CardAsset[];
}

// API Request/Response Types
export interface CreateTemplateRequest {
  name: string;
  description?: string;
  category?: string;
  craft_state: CraftState;
  oca_branding?: OCABranding;
  oca_meta?: OCAMeta;
  card_width?: number;
  card_height?: number;
  thumbnail?: string;
}

export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  category?: string;
  craft_state?: CraftState;
  oca_branding?: OCABranding;
  oca_meta?: OCAMeta;
  card_width?: number;
  card_height?: number;
  thumbnail?: string;
}

export interface UploadAssetRequest {
  template_id?: string;
  asset_type: 'logo' | 'background' | 'icon' | 'decoration';
  file_name: string;
  mime_type: string;
  content: string;
  width?: number;
  height?: number;
}

// Template Categories
export const TEMPLATE_CATEGORIES = [
  { value: 'education', label: 'Education' },
  { value: 'professional', label: 'Professional' },
  { value: 'membership', label: 'Membership' },
  { value: 'government', label: 'Government' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'custom', label: 'Custom' },
] as const;

// Default Card Dimensions
export const DEFAULT_CARD_WIDTH = 340;
export const DEFAULT_CARD_HEIGHT = 215;

// Shadow presets
export const SHADOW_PRESETS = {
  none: 'none',
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
};

// Font options
export const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Lato', label: 'Lato' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Poppins', label: 'Poppins' },
  { value: 'Playfair Display', label: 'Playfair Display' },
  { value: 'Georgia', label: 'Georgia' },
];

// Font weight options
export const FONT_WEIGHT_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'medium', label: 'Medium' },
  { value: 'semibold', label: 'Semibold' },
  { value: 'bold', label: 'Bold' },
];
