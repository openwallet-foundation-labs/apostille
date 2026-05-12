'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Icon } from '../../components/ui/Icons';
import {
  credentialDefinitionApi,
  schemaApi,
  MDL_DOCTYPE,
  MID_DOCTYPE,
  type MdocNamespaceData,
  type CredentialFormat,
} from '../../../lib/api';
import { credentialDesignerApi } from '../../../lib/credential-designer/api';
import { exportCraftStateToOCA, getSvgBindingsFromCraftState } from '../../../lib/credential-designer/ocaExporter';
import { CardTemplate, CraftState } from '../../../lib/credential-designer/types';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import Link from 'next/link';
import MdlNamespaceConfig from '../../components/mdoc/MdlNamespaceConfig';
import CreateCredDefModal from './CreateCredDefModal';
import CredDefDetailsModal from './CredDefDetailsModal';

interface CredentialDefinition {
  id: string;
  credentialDefinitionId: string;
  schemaId: string;
  issuerId: string;
  tag: string;
  type?: string;
  methodName?: string;
  createdAt?: string;
  updatedAt?: string;
  revocable?: boolean;
  format?: CredentialFormat;
  doctype?: string;
  namespaces?: MdocNamespaceData;
}

interface CredentialDefinitionResponse {
  id: string;
  credentialDefinitionId: string;
  methodName?: string;
  createdAt?: string;
  updatedAt?: string;
  credentialDefinition?: {
    issuerId: string;
    schemaId: string;
    tag: string;
    type?: string;
    value?: any;
  };
}

interface Schema {
  id: string;
  name: string;
  version: string;
  issuerId?: string;
  attributes?: string[];
  schemaId?: string;
  methodName?: string;
  _rawSchema?: any;
}

interface SchemaDetails {
  id: string;
  schemaId: string;
  methodName?: string;
  createdAt?: string;
  updatedAt?: string;
  _tags?: {
    issuerId?: string;
    methodName?: string;
    schemaId?: string;
    schemaName?: string;
    schemaVersion?: string;
  };
  schema: {
    attrNames: string[];
    issuerId: string;
    name: string;
    version: string;
  };
}

export default function CredentialDefinitionsPage() {
  const { tenantId } = useAuth();
  const [credentialDefinitions, setCredentialDefinitions] = useState<CredentialDefinition[]>([]);
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string>('');
  const [tag, setTag] = useState<string>('');
  const [supportRevocation, setSupportRevocation] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [credentialFormat, setCredentialFormat] = useState<CredentialFormat>('anoncreds');

  // mdoc-specific state
  const [mdocDoctype, setMdocDoctype] = useState<string>(MDL_DOCTYPE);
  const [mdocSelectedAttributes, setMdocSelectedAttributes] = useState<string[]>([]);
  const [mdocNamespaces, setMdocNamespaces] = useState<MdocNamespaceData>({});

  // W3C VC / OBv3 specific state
  const [w3cVcTypes, setW3cVcTypes] = useState<string>('VerifiableCredential');
  const [w3cVcContexts, setW3cVcContexts] = useState<string>('');
  const [w3cAttributesText, setW3cAttributesText] = useState<string>('');
  const [w3cProofSuite, setW3cProofSuite] = useState<string>('Ed25519Signature2020');
  const [w3cSigningAlg, setW3cSigningAlg] = useState<string>('EdDSA');
  const [obAchievementName, setObAchievementName] = useState<string>('');
  const [obAchievementDesc, setObAchievementDesc] = useState<string>('');
  const [obAchievementType, setObAchievementType] = useState<string>('Badge');
  const [obAchievementCriteria, setObAchievementCriteria] = useState<string>('');
  const [obAchievementImage, setObAchievementImage] = useState<string>('');

  // OCA Overlay state
  const [showOverlayFields, setShowOverlayFields] = useState<boolean>(false);
  const [overlayMeta, setOverlayMeta] = useState({
    name: '',
    description: '',
    issuer: '',
    issuer_url: '',
    issuer_description: '',
  });
  const [overlayBranding, setOverlayBranding] = useState({
    primary_background_color: '#FFFFFF',
    secondary_background_color: '#F5F5F5',
    primary_attribute: '',
    secondary_attribute: '',
    tertiary_attribute: '',
    quaternary_attribute: '',
    quinary_attribute: '',
    logo: '',
    background_image: '',
    svg_template_url: '',
    svg_bindings: {} as Record<string, string>,
  });
  const [availableAttributeRoles, setAvailableAttributeRoles] = useState<string[]>([
    'primary_attribute',
    'secondary_attribute',
  ]);

  // Credential Designer Templates
  const [designerTemplates, setDesignerTemplates] = useState<CardTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [loadingTemplates, setLoadingTemplates] = useState<boolean>(false);
  const [useDesignerTemplate, setUseDesignerTemplate] = useState<boolean>(false);

  const [selectedCredDef, setSelectedCredDef] = useState<CredentialDefinition | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);
  const [schemaDetails, setSchemaDetails] = useState<SchemaDetails | null>(null);
  const [loadingSchema, setLoadingSchema] = useState<boolean>(false);
  const [overlayData, setOverlayData] = useState<any>(null);
  const [loadingOverlay, setLoadingOverlay] = useState<boolean>(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!tenantId) return;

      setLoading(true);
      try {
        const credDefResponse = await credentialDefinitionApi.getAll();
        console.log(credDefResponse, "credDefResponse");

        let credDefs = credDefResponse.credentialDefinitions || [];

        credDefs = credDefs.map((cd: CredentialDefinitionResponse) => {
          if (cd.credentialDefinition) {
            return {
              id: cd.id || '',
              credentialDefinitionId: cd.credentialDefinitionId || '',
              schemaId: cd.credentialDefinition.schemaId || '',
              issuerId: cd.credentialDefinition.issuerId || '',
              tag: cd.credentialDefinition.tag || '',
              type: cd.credentialDefinition.type,
              methodName: cd.methodName,
              createdAt: cd.createdAt,
              updatedAt: cd.updatedAt,
              revocable: (cd.credentialDefinition as any)?.revocable || false,
              format: (cd as any).format || 'anoncreds',
            };
          }
          return cd as unknown as CredentialDefinition;
        });

        setCredentialDefinitions(credDefs);

        const schemasResponse = await schemaApi.getAll();

        const enhancedSchemas = schemasResponse.schemas || [];

        const enhancedSchemasPromises = enhancedSchemas.map(async (schema: any) => {
          try {
            const detailedSchema = await schemaApi.getById(schema.id);
            console.log('Got detailed schema:', detailedSchema);
            
            if (detailedSchema) {
              return {
                id: schema.id,
                name: detailedSchema.schema?.name || schema.schema?.name || schema._tags?.schemaName || '',
                version: detailedSchema.schema?.version || schema.schema?.version || schema._tags?.schemaVersion || '',
                issuerId: detailedSchema.schema?.issuerId || schema.schema?.issuerId || schema._tags?.issuerId || '',
                attributes: detailedSchema.schema?.attrNames || schema.schema?.attrNames || schema.attributes || [],
                schemaId: detailedSchema.schemaId || schema.schemaId || '',
                methodName: detailedSchema.methodName || schema.methodName || schema._tags?.methodName || '',
                _rawSchema: detailedSchema // Keep original data for debugging
              };
            }
          } catch (e) {
            console.warn(`Could not fetch details for schema ${schema.id}`, e);
          }
          
          return {
            id: schema.id,
            name: schema.schema?.name || schema._tags?.schemaName || '',
            version: schema.schema?.version || schema._tags?.schemaVersion || '',
            issuerId: schema.schema?.issuerId || schema._tags?.issuerId || '',
            attributes: schema.schema?.attrNames || schema.attributes || [],
            schemaId: schema.schemaId || '',
            methodName: schema.methodName || schema._tags?.methodName || '',
            _rawSchema: schema // Keep original data for debugging
          };
        });

        const resolvedSchemas = await Promise.all(enhancedSchemasPromises);
        setSchemas(resolvedSchemas);

        setError(null);
      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError(err.message || 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tenantId]);

  const openModal = async () => {
    setIsOpen(true);
    // Fetch credential designer templates when modal opens
    setLoadingTemplates(true);
    try {
      const response = await credentialDesignerApi.getTemplates();
      if (response.success) {
        setDesignerTemplates(response.templates || []);
      }
    } catch (err) {
      console.error('Failed to load designer templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const closeModal = () => {
    setIsOpen(false);
    // Reset template selection
    setSelectedTemplateId('');
    setUseDesignerTemplate(false);
    setCredentialFormat('anoncreds');
    setAvailableAttributeRoles(['primary_attribute', 'secondary_attribute']);
    // Reset mdoc state
    setMdocDoctype(MDL_DOCTYPE);
    setMdocSelectedAttributes([]);
    setMdocNamespaces({});
  };

  // Handle template selection and auto-fill OCA fields
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);

    if (!templateId) {
      // Reset to defaults if no template selected
      setOverlayMeta({
        name: '',
        description: '',
        issuer: '',
        issuer_url: '',
        issuer_description: '',
      });
      setOverlayBranding({
        primary_background_color: '#FFFFFF',
        secondary_background_color: '#F5F5F5',
        primary_attribute: '',
        secondary_attribute: '',
        tertiary_attribute: '',
        quaternary_attribute: '',
        quinary_attribute: '',
        logo: '',
        background_image: '',
        svg_template_url: '',
        svg_bindings: {},
      });
      setAvailableAttributeRoles(['primary_attribute', 'secondary_attribute']);
      setAvailableAttributeRoles(['primary_attribute', 'secondary_attribute']);
      return;
    }

    const template = designerTemplates.find(t => t.id === templateId);
    if (template) {
      const getRoleAttributeName = (craftState: CraftState, role: 'primary' | 'secondary'): string => {
        for (const node of Object.values(craftState)) {
          if (node.type?.resolvedName !== 'AttributeNode') continue;
          const props = node.props as { role?: string; attributeName?: string };
          if (props.role === role && props.attributeName) return props.attributeName;
        }
        return '';
      };

      // Export OCA from the template's craft_state
      const overlay = exportCraftStateToOCA(template.craft_state as CraftState);
      const svgBindingsFromCraft = getSvgBindingsFromCraftState(template.craft_state as CraftState);
      const primaryPlaceholder = getRoleAttributeName(template.craft_state as CraftState, 'primary');
      const secondaryPlaceholder = getRoleAttributeName(template.craft_state as CraftState, 'secondary');
      const requestedPrimary = (overlay.branding as any)?.primary_attribute || (template.oca_branding as any)?.primary_attribute || '';
      const requestedSecondary = (overlay.branding as any)?.secondary_attribute || (template.oca_branding as any)?.secondary_attribute || '';
      if (primaryPlaceholder) {
        if (requestedPrimary) {
          svgBindingsFromCraft[primaryPlaceholder] = requestedPrimary;
        } else {
          delete svgBindingsFromCraft[primaryPlaceholder];
        }
      }
      if (secondaryPlaceholder) {
        if (requestedSecondary) {
          svgBindingsFromCraft[secondaryPlaceholder] = requestedSecondary;
        } else {
          delete svgBindingsFromCraft[secondaryPlaceholder];
        }
      }

      // Also merge with any stored oca_branding and oca_meta
      const meta = { ...overlay.meta, ...template.oca_meta };
      const branding = {
        ...overlay.branding,
        ...template.oca_branding,
        svg_bindings:
          (template.oca_branding as any)?.svg_bindings &&
          Object.keys((template.oca_branding as any).svg_bindings).length > 0
            ? (template.oca_branding as any).svg_bindings
            : svgBindingsFromCraft,
      };

      // Update overlay meta fields
      setOverlayMeta({
        name: meta?.name || template.name || '',
        description: meta?.description || template.description || '',
        issuer: meta?.issuer || '',
        issuer_url: meta?.issuer_url || '',
        issuer_description: meta?.issuer_description || '',
      });

      // Update overlay branding fields
      setOverlayBranding({
        primary_background_color: branding?.primary_background_color || '#FFFFFF',
        secondary_background_color: branding?.secondary_background_color || '#F5F5F5',
        primary_attribute: branding?.primary_attribute || '',
        secondary_attribute: branding?.secondary_attribute || '',
        tertiary_attribute: branding?.tertiary_attribute || '',
        quaternary_attribute: branding?.quaternary_attribute || '',
        quinary_attribute: branding?.quinary_attribute || '',
        logo: branding?.logo || '',
        background_image: branding?.background_image || '',
        svg_template_url: branding?.svg_template_url || '',
        svg_bindings: branding?.svg_bindings || {},
      });

      const roleOrder = [
        'primary_attribute',
        'secondary_attribute',
        'tertiary_attribute',
        'quaternary_attribute',
        'quinary_attribute',
      ];
      const presentRoles = roleOrder.filter((roleKey) => {
        const overlayValue = (overlay.branding as any)?.[roleKey];
        const templateValue = (template.oca_branding as any)?.[roleKey];
        return overlayValue !== undefined || templateValue !== undefined;
      });
      setAvailableAttributeRoles(presentRoles.length > 0 ? presentRoles : ['primary_attribute', 'secondary_attribute']);

      // Auto-expand overlay fields section
      setShowOverlayFields(true);
    }
  };

  const openDetailsModal = async (credDef: CredentialDefinition) => {
    setSelectedCredDef(credDef);
    setIsDetailsOpen(true);
    setOverlayData(null);
    console.log('credDef', credDef);

    // Fetch full credential definition details (includes overlay for Kanon DIDs)
    if (credDef.credentialDefinitionId) {
      setLoadingOverlay(true);
      try {
        const credDefResponse = await credentialDefinitionApi.getById(credDef.credentialDefinitionId);
        console.log('CredDef details response:', credDefResponse);
        if (credDefResponse?.overlay) {
          setOverlayData(credDefResponse.overlay);
        }
      } catch (err) {
        console.error('Error fetching credential definition details:', err);
      } finally {
        setLoadingOverlay(false);
      }
    }

    if (credDef.schemaId) {
      setLoadingSchema(true);
      try {
        const schemaResponse = await schemaApi.getBySchemaId(credDef.schemaId);
        console.log('Schema details response:', schemaResponse);

        if (schemaResponse) {
          if (schemaResponse.schema) {
            setSchemaDetails(schemaResponse.schema);
          } else if (schemaResponse.schemaId) {
            setSchemaDetails(schemaResponse);
          } else {
            console.error('Unexpected schema response format', schemaResponse);
            setSchemaDetails(null);
          }
        } else {
          console.error('Schema not found or invalid response format');
          setSchemaDetails(null);
        }
      } catch (err) {
        console.error('Error fetching schema details:', err);
        setSchemaDetails(null);
      } finally {
        setLoadingSchema(false);
      }
    }
  };

  const closeDetailsModal = () => {
    setSelectedCredDef(null);
    setIsDetailsOpen(false);
    setSchemaDetails(null);
    setOverlayData(null);
  };

  const getAssetExtension = (mimeType: string) => {
    switch (mimeType) {
      case 'image/png':
        return 'png';
      case 'image/jpeg':
      case 'image/jpg':
        return 'jpg';
      case 'image/svg+xml':
        return 'svg';
      case 'image/webp':
        return 'webp';
      case 'image/gif':
        return 'gif';
      default:
        return 'img';
    }
  };

  const uploadDataUrlAsset = async (
    dataUrl: string,
    assetType: 'logo' | 'background'
  ) => {
    const match = dataUrl.match(/^data:([^;]+);base64,/);
    if (!match) return dataUrl;

    const mimeType = match[1];
    const extension = getAssetExtension(mimeType);

    try {
      const result = await credentialDesignerApi.uploadAsset({
        template_id: selectedTemplateId || undefined,
        asset_type: assetType,
        file_name: `credential-${assetType}.${extension}`,
        mime_type: mimeType,
        content: dataUrl,
      });

      return result.asset.public_url || dataUrl;
    } catch (error) {
      console.warn('Failed to upload OCA asset, using data URL instead:', error);
      return dataUrl;
    }
  };

  const handleCreateCredDef = async (e: React.FormEvent) => {
    e.preventDefault();

    const isSchemaLessFormat =
      credentialFormat === 'mso_mdoc' ||
      credentialFormat === 'jwt_vc_json' ||
      credentialFormat === 'jwt_vc_json-ld' ||
      credentialFormat === 'ldp_vc' ||
      credentialFormat === 'openbadge_v3'

    // mdoc + W3C/OBv3 formats are schema-less in this UI path.
    if (isSchemaLessFormat) {
      if (!tenantId || !tag) {
        setError('Tag is required')
        return
      }
      if (credentialFormat === 'openbadge_v3' && !obAchievementName.trim()) {
        setError('Achievement name is required for OpenBadges v3')
        return
      }
    } else {
      if (!tenantId || !selectedSchemaId || !tag) {
        setError('Schema and tag are required')
        return
      }
    }

    setCreating(true);
    setError(null);

    try {
      const selectedSchema =
        credentialFormat === 'mso_mdoc'
          ? undefined
          : schemas.find((schema) => schema.id === selectedSchemaId);
      const schemaAttributes = selectedSchema?.attributes || [];

      const brandingForOverlay = { ...overlayBranding };
      if (brandingForOverlay.logo && brandingForOverlay.logo.startsWith('data:')) {
        brandingForOverlay.logo = await uploadDataUrlAsset(brandingForOverlay.logo, 'logo');
      }
      if (brandingForOverlay.background_image && brandingForOverlay.background_image.startsWith('data:')) {
        brandingForOverlay.background_image = await uploadDataUrlAsset(
          brandingForOverlay.background_image,
          'background'
        );
      }

      // Build overlay if any fields are filled
      let overlay = undefined;

      // If a designer template is selected, prefer its OCA data unless the user explicitly overrides a field in the form.
      const selectedTemplate = useDesignerTemplate
        ? designerTemplates.find((t) => t.id === selectedTemplateId)
        : undefined;
      const templateOverlay = selectedTemplate
        ? exportCraftStateToOCA(selectedTemplate.craft_state as CraftState)
        : undefined;
      const getRoleAttributeName = (craftState: CraftState, role: 'primary' | 'secondary'): string => {
        for (const node of Object.values(craftState)) {
          if (node.type?.resolvedName !== 'AttributeNode') continue;
          const props = node.props as { role?: string; attributeName?: string };
          if (props.role === role && props.attributeName) return props.attributeName;
        }
        return '';
      };
      const templateSvgBindings = selectedTemplate
        ? getSvgBindingsFromCraftState(selectedTemplate.craft_state as CraftState)
        : {};
      const templateMeta = {
        ...(templateOverlay?.meta || {}),
        ...(selectedTemplate?.oca_meta || {}),
      } as Record<string, string>;
      const templateBranding = {
        ...(templateOverlay?.branding || {}),
        ...(selectedTemplate?.oca_branding || {}),
        svg_bindings:
          (selectedTemplate?.oca_branding as any)?.svg_bindings &&
          Object.keys((selectedTemplate?.oca_branding as any).svg_bindings).length > 0
            ? (selectedTemplate?.oca_branding as any).svg_bindings
            : templateSvgBindings,
      } as Record<string, any>;

      const effectiveMeta = {
        name: overlayMeta.name.trim() || templateMeta.name || selectedTemplate?.name || '',
        description:
          overlayMeta.description.trim() || templateMeta.description || selectedTemplate?.description || '',
        issuer: overlayMeta.issuer.trim() || templateMeta.issuer || '',
        issuer_url: overlayMeta.issuer_url.trim() || templateMeta.issuer_url || '',
        issuer_description: overlayMeta.issuer_description.trim() || templateMeta.issuer_description || '',
      };

      const requestedPrimaryAttribute =
        brandingForOverlay.primary_attribute.trim() || templateBranding.primary_attribute || '';
      const requestedSecondaryAttribute =
        brandingForOverlay.secondary_attribute.trim() || templateBranding.secondary_attribute || '';
      const requestedTertiaryAttribute =
        brandingForOverlay.tertiary_attribute.trim() || templateBranding.tertiary_attribute || '';
      const requestedQuaternaryAttribute =
        brandingForOverlay.quaternary_attribute.trim() || templateBranding.quaternary_attribute || '';
      const requestedQuinaryAttribute =
        brandingForOverlay.quinary_attribute.trim() || templateBranding.quinary_attribute || '';

      if (schemaAttributes.length > 0) {
        if (requestedPrimaryAttribute && !schemaAttributes.includes(requestedPrimaryAttribute)) {
          const message = `Primary attribute "${requestedPrimaryAttribute}" is not in schema attributes`;
          console.warn(message);
          setError(message);
          return;
        }
        if (requestedSecondaryAttribute && !schemaAttributes.includes(requestedSecondaryAttribute)) {
          const message = `Secondary attribute "${requestedSecondaryAttribute}" is not in schema attributes`;
          console.warn(message);
          setError(message);
          return;
        }
        if (requestedTertiaryAttribute && !schemaAttributes.includes(requestedTertiaryAttribute)) {
          const message = `Tertiary attribute "${requestedTertiaryAttribute}" is not in schema attributes`;
          console.warn(message);
          setError(message);
          return;
        }
        if (requestedQuaternaryAttribute && !schemaAttributes.includes(requestedQuaternaryAttribute)) {
          const message = `Quaternary attribute "${requestedQuaternaryAttribute}" is not in schema attributes`;
          console.warn(message);
          setError(message);
          return;
        }
        if (requestedQuinaryAttribute && !schemaAttributes.includes(requestedQuinaryAttribute)) {
          const message = `Quinary attribute "${requestedQuinaryAttribute}" is not in schema attributes`;
          console.warn(message);
          setError(message);
          return;
        }
      }

      const effectiveBranding = {
        primary_background_color:
          brandingForOverlay.primary_background_color !== '#FFFFFF'
            ? brandingForOverlay.primary_background_color
            : templateBranding.primary_background_color || '#FFFFFF',
        secondary_background_color:
          brandingForOverlay.secondary_background_color !== '#F5F5F5'
            ? brandingForOverlay.secondary_background_color
            : templateBranding.secondary_background_color || '#F5F5F5',
        primary_attribute: requestedPrimaryAttribute,
        secondary_attribute: requestedSecondaryAttribute,
        tertiary_attribute: requestedTertiaryAttribute,
        quaternary_attribute: requestedQuaternaryAttribute,
        quinary_attribute: requestedQuinaryAttribute,
        logo: brandingForOverlay.logo.trim() || templateBranding.logo || '',
        background_image:
          brandingForOverlay.background_image.trim() || templateBranding.background_image || '',
        svg_template_url:
          (brandingForOverlay.svg_template_url || '').trim() || templateBranding.svg_template_url || '',
        svg_bindings:
          brandingForOverlay.svg_bindings && Object.keys(brandingForOverlay.svg_bindings).length > 0
            ? brandingForOverlay.svg_bindings
            : templateBranding.svg_bindings || {},
      };

      if (selectedTemplate) {
        const primaryPlaceholder = getRoleAttributeName(selectedTemplate.craft_state as CraftState, 'primary');
        const secondaryPlaceholder = getRoleAttributeName(selectedTemplate.craft_state as CraftState, 'secondary');

        if (primaryPlaceholder) {
          if (requestedPrimaryAttribute) {
            effectiveBranding.svg_bindings = {
              ...effectiveBranding.svg_bindings,
              [primaryPlaceholder]: requestedPrimaryAttribute,
            };
          } else {
            const { [primaryPlaceholder]: _removed, ...rest } = effectiveBranding.svg_bindings || {};
            effectiveBranding.svg_bindings = rest;
          }
        }

        if (secondaryPlaceholder) {
          if (requestedSecondaryAttribute) {
            effectiveBranding.svg_bindings = {
              ...effectiveBranding.svg_bindings,
              [secondaryPlaceholder]: requestedSecondaryAttribute,
            };
          } else {
            const { [secondaryPlaceholder]: _removed, ...rest } = effectiveBranding.svg_bindings || {};
            effectiveBranding.svg_bindings = rest;
          }
        }
      }

      const hasMetaFields = Object.values(effectiveMeta).some((v) => v.trim() !== '');
      const hasBrandingFields =
        effectiveBranding.primary_background_color !== '#FFFFFF' ||
        effectiveBranding.secondary_background_color !== '#F5F5F5' ||
        effectiveBranding.primary_attribute.trim() !== '' ||
        effectiveBranding.secondary_attribute.trim() !== '' ||
        (effectiveBranding.tertiary_attribute || '').trim() !== '' ||
        (effectiveBranding.quaternary_attribute || '').trim() !== '' ||
        (effectiveBranding.quinary_attribute || '').trim() !== '' ||
        effectiveBranding.logo.trim() !== '' ||
        effectiveBranding.background_image.trim() !== '' ||
        (effectiveBranding.svg_template_url || '').trim() !== '' ||
        (effectiveBranding.svg_bindings && Object.keys(effectiveBranding.svg_bindings).length > 0);

      if (hasMetaFields || hasBrandingFields) {
        const brandingPayload: Record<string, unknown> = {};
        if (effectiveBranding.primary_background_color !== '#FFFFFF') {
          brandingPayload.primary_background_color = effectiveBranding.primary_background_color;
        }
        if (effectiveBranding.secondary_background_color !== '#F5F5F5') {
          brandingPayload.secondary_background_color = effectiveBranding.secondary_background_color;
        }
        if (effectiveBranding.primary_attribute.trim() !== '') {
          brandingPayload.primary_attribute = effectiveBranding.primary_attribute;
        }
        if (effectiveBranding.secondary_attribute.trim() !== '') {
          brandingPayload.secondary_attribute = effectiveBranding.secondary_attribute;
        }
        if ((effectiveBranding.tertiary_attribute || '').trim() !== '') {
          brandingPayload.tertiary_attribute = effectiveBranding.tertiary_attribute;
        }
        if ((effectiveBranding.quaternary_attribute || '').trim() !== '') {
          brandingPayload.quaternary_attribute = effectiveBranding.quaternary_attribute;
        }
        if ((effectiveBranding.quinary_attribute || '').trim() !== '') {
          brandingPayload.quinary_attribute = effectiveBranding.quinary_attribute;
        }
        if (effectiveBranding.logo.trim() !== '') {
          brandingPayload.logo = effectiveBranding.logo;
        }
        if (effectiveBranding.background_image.trim() !== '') {
          brandingPayload.background_image = effectiveBranding.background_image;
        }
        if ((effectiveBranding.svg_template_url || '').trim() !== '') {
          brandingPayload.svg_template_url = effectiveBranding.svg_template_url;
        }
        if (effectiveBranding.svg_bindings && Object.keys(effectiveBranding.svg_bindings).length > 0) {
          brandingPayload.svg_bindings = effectiveBranding.svg_bindings;
        }

        overlay = {
          ...(hasMetaFields && {
            meta: Object.fromEntries(
              Object.entries(effectiveMeta).filter(([_, v]) => v.trim() !== '')
            )
          }),
          ...(hasBrandingFields && {
            branding: brandingPayload
          }),
        };
      }

      // For mdoc format, use createMdoc API
      let response;
      if (credentialFormat === 'mso_mdoc') {
        console.log('Creating mdoc credential definition with:', {
          tenantId,
          tag,
          doctype: mdocDoctype,
          namespaces: mdocNamespaces,
          overlay,
        });

        response = await credentialDefinitionApi.createMdoc({
          format: 'mso_mdoc',
          tag,
          doctype: mdocDoctype,
          namespaces: mdocNamespaces,
          overlay,
        });
      } else if (
        credentialFormat === 'jwt_vc_json' ||
        credentialFormat === 'jwt_vc_json-ld' ||
        credentialFormat === 'ldp_vc' ||
        credentialFormat === 'openbadge_v3'
      ) {
        const types = w3cVcTypes.split(',').map(s => s.trim()).filter(Boolean)
        const contexts = w3cVcContexts.split(',').map(s => s.trim()).filter(Boolean)
        const attributes = w3cAttributesText.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
        const w3cOptions = {
          vcTypes: types.length > 0 ? types : undefined,
          vcContexts: contexts.length > 0 ? contexts : undefined,
          schemaAttributes: attributes.length > 0 ? attributes : undefined,
          proofSuite: credentialFormat === 'ldp_vc' ? w3cProofSuite : undefined,
          signingAlg: credentialFormat === 'jwt_vc_json' || credentialFormat === 'jwt_vc_json-ld'
            ? w3cSigningAlg
            : undefined,
          achievement: credentialFormat === 'openbadge_v3' && obAchievementName
            ? {
                name: obAchievementName,
                description: obAchievementDesc,
                achievementType: obAchievementType,
                ...(obAchievementCriteria && { criteria: { narrative: obAchievementCriteria } }),
                ...(obAchievementImage && { image: obAchievementImage }),
              }
            : undefined,
        }

        // Make OBv3 credential definitions human-readable in dropdowns and
        // credential cards even when no template is selected.
        const effectiveOverlay = credentialFormat === 'openbadge_v3'
          ? {
              ...overlay,
              meta: {
                ...(overlay?.meta || {}),
                name: overlay?.meta?.name || obAchievementName || tag,
                description:
                  overlay?.meta?.description ||
                  obAchievementDesc ||
                  'OpenBadge v3 credential',
                issuer: overlay?.meta?.issuer || process.env.NEXT_PUBLIC_ISSUER_NAME || 'ESSI Studio',
                credential_type: 'openbadge_v3',
              },
            }
          : overlay

        response = await credentialDefinitionApi.create(
          selectedSchemaId || `${credentialFormat}:${tag}`,
          tag,
          supportRevocation,
          effectiveOverlay,
          credentialFormat,
          undefined,
          w3cOptions,
        )
      } else {
        if (!selectedSchema) {
          throw new Error('Selected schema not found');
        }

        console.log('Creating credential definition with:', {
          tenantId,
          schemaId: selectedSchemaId,
          tag,
          supportRevocation,
          overlay,
          format: credentialFormat
        });

        response = await credentialDefinitionApi.create(selectedSchemaId, tag, supportRevocation, overlay, credentialFormat);
      }
      console.log('Created credential definition:', response);

      const credDefResponse = await credentialDefinitionApi.getAll();
      console.log('Updated credential definitions:', credDefResponse);
      setCredentialDefinitions(credDefResponse.credentialDefinitions || []);

      setSelectedSchemaId('');
      setTag('');
      setSupportRevocation(false);
      setCredentialFormat('anoncreds');
      setShowOverlayFields(false);
      setOverlayMeta({
        name: '',
        description: '',
        issuer: '',
        issuer_url: '',
        issuer_description: '',
      });
      setOverlayBranding({
        primary_background_color: '#FFFFFF',
        secondary_background_color: '#F5F5F5',
        primary_attribute: '',
        secondary_attribute: '',
        tertiary_attribute: '',
        quaternary_attribute: '',
        quinary_attribute: '',
        logo: '',
        background_image: '',
        svg_template_url: '',
        svg_bindings: {},
      });
      setAvailableAttributeRoles(['primary_attribute', 'secondary_attribute']);
      // Reset mdoc state
      setMdocDoctype(MDL_DOCTYPE);
      setMdocSelectedAttributes([]);
      setMdocNamespaces({});

      closeModal();
    } catch (err: any) {
      console.error('Error creating credential definition:', err);
      setError(err.message || 'Failed to create credential definition');
    } finally {
      setCreating(false);
    }
  };

  const formatSchemaName = (schemaId: string) => {
    if (!schemaId) return 'N/A';

    const schema = schemas.find(s => s.id === schemaId);
    if (!schema) return schemaId;
    return `${schema.name} (${schema.version})`;
  };

  const selectedSchema = schemas.find((schema) => schema.id === selectedSchemaId);
  const requiredAttributeCount =
    credentialFormat === 'mso_mdoc' ? 0 : (selectedSchema?.attributes?.length || 0);
  const templateAttributeRoleKeys = [
    'primary_attribute',
    'secondary_attribute',
    'tertiary_attribute',
    'quaternary_attribute',
    'quinary_attribute',
  ] as const;
  const getTemplateAttributeCount = (template: CardTemplate) => {
    const overlay = exportCraftStateToOCA(template.craft_state as CraftState);
    const branding = {
      ...(overlay?.branding || {}),
      ...(template.oca_branding || {}),
    } as Record<string, unknown>;

    return templateAttributeRoleKeys.reduce((count, roleKey) => {
      const value = branding[roleKey];
      if (typeof value === 'string' && value.trim() !== '') {
        return count + 1;
      }
      return count;
    }, 0);
  };
  const selectedTemplate = designerTemplates.find((template) => template.id === selectedTemplateId);
  const selectedTemplateAttributeCount = selectedTemplate
    ? getTemplateAttributeCount(selectedTemplate)
    : 0;
  const selectedTemplateMissingRequired =
    requiredAttributeCount > 0 &&
    Boolean(selectedTemplateId) &&
    selectedTemplateAttributeCount < requiredAttributeCount;

  // Compute format counts
  const formatCounts: Record<string, number> = {};
  credentialDefinitions.forEach(cd => {
    const f = cd.format || 'anoncreds';
    formatCounts[f] = (formatCounts[f] || 0) + 1;
  });

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Credential Definitions</h1>
          <p className="page-sub">Format bindings, revocation, and OCA branding.</p>
        </div>
        <button className="btn btn-primary" onClick={openModal}>
          <Icon name="plus" size={14} /> Create Definition
        </button>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}><span>{error}</span></div>
      )}

      {/* Format stat cards */}
      {!loading && credentialDefinitions.length > 0 && (
        <div className="grid-3" style={{ marginBottom: 24 }}>
          {[
            { key: 'anoncreds', label: 'AnonCreds' },
            { key: 'oid4vc', label: 'OID4VC' },
            { key: 'mso_mdoc', label: 'MSO mDoc' },
          ].map((fmt) => (
            <div key={fmt.key} className="card card-pad" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="layers" size={16} style={{ color: 'var(--violet)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{fmt.label}</div>
                  <div className="mono-dim" style={{ fontSize: 11 }}>format</div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
                  {formatCounts[fmt.key] || 0}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="empty"><div className="spinner" style={{ width: 32, height: 32 }} /></div>
      ) : credentialDefinitions.length > 0 ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cred Def ID</th>
                <th>Schema</th>
                <th>Format</th>
                <th>Tag</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {credentialDefinitions.map((credDef) => (
                <tr key={credDef.id}>
                  <td><span className="mono" style={{ fontSize: 12 }}>{(credDef.credentialDefinitionId || credDef.id || '').slice(0, 30)}...</span></td>
                  <td><span className="mono mono-dim" style={{ fontSize: 11.5 }}>{(credDef.schemaId || '').slice(0, 25)}...</span></td>
                  <td>
                    <span className="badge violet">
                      {credDef.format === 'mso_mdoc' ? 'mDL/mdoc' : credDef.format === 'oid4vc' ? 'OID4VC' : 'AnonCreds'}
                    </span>
                  </td>
                  <td><span className="tag">{credDef.tag || '—'}</span></td>
                  <td><span className="mono-dim">{credDef.createdAt ? new Date(credDef.createdAt).toLocaleDateString() : '—'}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-secondary btn-xs" onClick={() => openDetailsModal(credDef)}>Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <div className="empty-icon"><Icon name="layers" size={22} /></div>
          <div className="empty-title">No credential definitions found</div>
          <div className="empty-desc">Create your first credential definition to start issuing credentials.</div>
          <div className="empty-actions">
            <button className="btn btn-primary" onClick={openModal}>Create Your First Definition
            </button>
          </div>
        </div>
      )}

      {/* Create Credential Definition Modal — new design */}
      <CreateCredDefModal
        isOpen={isOpen}
        onClose={closeModal}
        schemas={schemas.map(s => ({ ...s, attributes: s.attributes || s._rawSchema?.attrNames || [] }))}
        designerTemplates={designerTemplates}
        loadingTemplates={loadingTemplates}
        credentialFormat={credentialFormat}
        setCredentialFormat={setCredentialFormat}
        selectedSchemaId={selectedSchemaId}
        setSelectedSchemaId={setSelectedSchemaId}
        tag={tag}
        setTag={setTag}
        supportRevocation={supportRevocation}
        setSupportRevocation={setSupportRevocation}
        selectedTemplateId={selectedTemplateId}
        onTemplateSelect={handleTemplateSelect}
        creating={creating}
        onSubmit={handleCreateCredDef}
        error={error}
        w3cVcTypes={w3cVcTypes}
        setW3cVcTypes={setW3cVcTypes}
        w3cVcContexts={w3cVcContexts}
        setW3cVcContexts={setW3cVcContexts}
        w3cAttributesText={w3cAttributesText}
        setW3cAttributesText={setW3cAttributesText}
        w3cProofSuite={w3cProofSuite}
        setW3cProofSuite={setW3cProofSuite}
        w3cSigningAlg={w3cSigningAlg}
        setW3cSigningAlg={setW3cSigningAlg}
        obAchievementName={obAchievementName}
        setObAchievementName={setObAchievementName}
        obAchievementDesc={obAchievementDesc}
        setObAchievementDesc={setObAchievementDesc}
        obAchievementType={obAchievementType}
        setObAchievementType={setObAchievementType}
        obAchievementCriteria={obAchievementCriteria}
        setObAchievementCriteria={setObAchievementCriteria}
        obAchievementImage={obAchievementImage}
        setObAchievementImage={setObAchievementImage}
      />

      {/* Credential Definition Details Modal — new design */}
      <CredDefDetailsModal
        isOpen={isDetailsOpen}
        onClose={closeDetailsModal}
        credDef={selectedCredDef}
        schemaDetails={schemaDetails}
        overlayData={overlayData}
        loadingOverlay={loadingOverlay}
      />

    </div>
  );
}
