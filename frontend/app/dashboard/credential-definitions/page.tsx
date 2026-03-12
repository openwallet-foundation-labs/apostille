'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
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
    logo: '',
    background_image: '',
    svg_template_url: '',
    svg_bindings: {} as Record<string, string>,
  });

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
        logo: '',
        background_image: '',
        svg_template_url: '',
        svg_bindings: {},
      });
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
        logo: branding?.logo || '',
        background_image: branding?.background_image || '',
        svg_template_url: branding?.svg_template_url || '',
        svg_bindings: branding?.svg_bindings || {},
      });

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

    // For mdoc format, only tag is required (no schema needed)
    if (credentialFormat === 'mso_mdoc') {
      if (!tenantId || !tag) return;
    } else {
      if (!tenantId || !selectedSchemaId || !tag) return;
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
        logo: '',
        background_image: '',
        svg_template_url: '',
        svg_bindings: {},
      });
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

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex justify-end">
        <button className="btn btn-primary" onClick={openModal}>
          Create Credential Definition
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col justify-center items-center py-12">
          <div className="spinner h-12 w-12 mb-4"></div>
          <p className="text-text-secondary">Loading credential definitions...</p>
        </div>
      ) : credentialDefinitions.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border-primary">
              <thead className="bg-surface-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Credential Definition ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Schema</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Tag</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Format</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-primary">
                {credentialDefinitions.map((credDef) => (
                  <tr key={credDef.id} className="hover:bg-surface-200 transition-colors duration-200">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary font-mono truncate max-w-sm">{credDef.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary font-mono truncate max-w-sm">{credDef.credentialDefinitionId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary font-mono truncate max-w-sm">{credDef.schemaId}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="badge badge-primary">{credDef.tag}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`badge ${
                        credDef.format === 'mso_mdoc'
                          ? 'badge-success'
                          : credDef.format === 'oid4vc'
                          ? 'badge-info'
                          : 'badge-secondary'
                      }`}>
                        {credDef.format === 'mso_mdoc'
                          ? 'mDL/mdoc'
                          : credDef.format === 'oid4vc'
                          ? 'OID4VC'
                          : 'AnonCreds'}
                      </span>
                      {credDef.format === 'mso_mdoc' && credDef.doctype && (
                        <span className="ml-1 text-xs text-text-tertiary">
                          ({credDef.doctype.split('.').pop()})
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                       {credDef.createdAt ? new Date(credDef.createdAt).toLocaleString() : 'N/A'}
                     </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button className="text-primary-600 hover:text-primary-700 font-medium transition-colors duration-200" onClick={() => openDetailsModal(credDef)}>
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="empty-state-card">
          <div className="empty-state-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="empty-state-title">No credential definitions found</h3>
          <p className="empty-state-description">Create your first credential definition to start issuing credentials.</p>
          <div className="mt-6">
            <button className="btn btn-primary" onClick={openModal}>
              Create Your First Credential Definition
            </button>
          </div>
        </div>
      )}

      {/* Create Credential Definition Modal */}
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={closeModal}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-surface-50 dark:bg-surface-900 p-6 text-left align-middle shadow-xl transition-all max-h-[90vh] overflow-y-auto">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-text-primary">
                    Create New Credential Definition
                  </Dialog.Title>

                  <form onSubmit={handleCreateCredDef} className="mt-4">
                    {/* Credential Format Selector */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        Credential Format
                      </label>
                      <div className="space-y-3">
                        <label className="flex items-start gap-2 cursor-pointer p-2 rounded border border-transparent hover:bg-surface-100 dark:bg-surface-800">
                          <input
                            type="radio"
                            value="anoncreds"
                            checked={credentialFormat === 'anoncreds'}
                            onChange={() => setCredentialFormat('anoncreds')}
                            className="h-4 w-4 mt-1 text-primary-600 focus:ring-blue-500 border-border-secondary"
                          />
                          <div>
                            <span className="text-sm font-medium text-text-primary">AnonCreds</span>
                            <p className="text-xs text-text-tertiary">Traditional format, requires DIDComm connection</p>
                          </div>
                        </label>
                        <label className="flex items-start gap-2 cursor-pointer p-2 rounded border border-transparent hover:bg-surface-100 dark:bg-surface-800">
                          <input
                            type="radio"
                            value="oid4vc"
                            checked={credentialFormat === 'oid4vc'}
                            onChange={() => setCredentialFormat('oid4vc')}
                            className="h-4 w-4 mt-1 text-primary-600 focus:ring-blue-500 border-border-secondary"
                          />
                          <div>
                            <span className="text-sm font-medium text-text-primary">SD-JWT VC (OpenID4VC)</span>
                            <p className="text-xs text-text-tertiary">Modern format with QR code scanning</p>
                          </div>
                        </label>
                        <label className="flex items-start gap-2 cursor-pointer p-2 rounded border border-transparent hover:bg-surface-100 dark:bg-surface-800">
                          <input
                            type="radio"
                            value="mso_mdoc"
                            checked={credentialFormat === 'mso_mdoc'}
                            onChange={() => setCredentialFormat('mso_mdoc')}
                            className="h-4 w-4 mt-1 text-success-600 dark:text-success-400 focus:ring-green-500 border-border-secondary"
                          />
                          <div>
                            <span className="text-sm font-medium text-text-primary">mDL / mdoc (ISO 18013-5)</span>
                            <p className="text-xs text-text-tertiary">Mobile Driver&apos;s License or Mobile ID format</p>
                          </div>
                        </label>
                      </div>
                      {credentialFormat === 'oid4vc' && (
                        <div className="mt-2 p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-md">
                          <p className="text-sm text-primary-700 dark:text-primary-300">
                            <strong>OpenID4VC Mode:</strong> This credential will be issued via QR code scanning.
                            The issuer will use your tenant&apos;s <code className="bg-primary-100 dark:bg-primary-900/30 px-1 rounded">did:web</code> identifier.
                          </p>
                        </div>
                      )}
                      {credentialFormat === 'mso_mdoc' && (
                        <div className="mt-2 p-3 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-700 rounded-md">
                          <p className="text-sm text-success-700 dark:text-success-300">
                            <strong>mdoc Mode:</strong> This creates an ISO 18013-5 compliant mobile document (mDL or mID).
                            Issued via OpenID4VCI with CBOR encoding. No schema required - attributes are defined by namespaces.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Schema selector - only for non-mdoc formats */}
                    {credentialFormat !== 'mso_mdoc' && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-text-secondary mb-1">
                          Schema
                        </label>
                        <select
                          value={selectedSchemaId}
                          onChange={(e) => setSelectedSchemaId(e.target.value)}
                          className="w-full px-3 py-2 border border-border-secondary rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-text-primary"
                          required
                        >
                          <option value="">Select a schema</option>
                          {schemas.map((schema) => (
                            <option key={schema.id} value={schema.id}>
                              {schema.name} (v{schema.version}) - {schema.id.substring(0, 20)}...
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* mdoc Configuration - only for mso_mdoc format */}
                    {credentialFormat === 'mso_mdoc' && (
                      <div className="mb-4 space-y-4">
                        {/* Document Type Selector */}
                        <div>
                          <label className="block text-sm font-medium text-text-secondary mb-1">
                            Document Type
                          </label>
                          <select
                            value={mdocDoctype}
                            onChange={(e) => {
                              setMdocDoctype(e.target.value);
                              // Reset selected attributes when doctype changes
                              setMdocSelectedAttributes([]);
                              setMdocNamespaces({});
                            }}
                            className="w-full px-3 py-2 border border-border-secondary rounded-md shadow-sm focus:outline-none focus:ring-success-500 focus:border-success-500 text-text-primary"
                          >
                            <option value={MDL_DOCTYPE}>Mobile Driver&apos;s License (mDL)</option>
                            <option value={MID_DOCTYPE}>Mobile ID (mID)</option>
                            <option value="custom">Custom Document Type</option>
                          </select>
                          <p className="mt-1 text-xs text-text-tertiary font-mono">
                            {mdocDoctype}
                          </p>
                        </div>

                        {/* Namespace Configuration */}
                        <div className="border rounded-lg p-4 bg-surface-100 dark:bg-surface-800">
                          <MdlNamespaceConfig
                            doctype={mdocDoctype}
                            selectedAttributes={mdocSelectedAttributes}
                            onAttributesChange={setMdocSelectedAttributes}
                            onNamespacesChange={setMdocNamespaces}
                            allowCustomAttributes={mdocDoctype === 'custom'}
                          />
                        </div>
                      </div>
                    )}

                    {selectedSchemaId && credentialFormat !== 'mso_mdoc' && (
                      <div className="mb-4 p-3 bg-surface-100 dark:bg-surface-800 border border-border-secondary rounded-md">
                        <h4 className="text-sm font-medium text-text-secondary mb-2">Selected Schema Details</h4>
                        {(() => {
                          const schema = schemas.find(s => s.id === selectedSchemaId);
                          if (!schema) return <p className="text-sm text-red-500">Schema not found</p>;

                          console.log('Selected schema for CredDef:', schema);
                          
                          return (
                            <div className="space-y-1">
                              <p className="text-sm text-text-secondary"><span className="font-medium">ID:</span> {schema.id}</p>
                              <p className="text-sm text-text-secondary"><span className="font-medium">Schema ID:</span> {schema.schemaId || 'Unknown'}</p>
                              <p className="text-sm text-text-secondary"><span className="font-medium">Name:</span> {schema.name || 'Unknown'}</p>
                              <p className="text-sm text-text-secondary"><span className="font-medium">Version:</span> {schema.version || 'Unknown'}</p>
                              {schema.issuerId && (
                                <p className="text-sm text-text-secondary"><span className="font-medium">Issuer:</span> {schema.issuerId}</p>
                              )}
                              <p className="text-sm text-text-secondary"><span className="font-medium">Method:</span> {schema.methodName || 'Unknown'}</p>
                              {schema.attributes && schema.attributes.length > 0 && (
                                <div className="mt-2">
                                  <p className="text-sm font-medium text-text-secondary">Attributes:</p>
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {schema.attributes.map((attr, index) => (
                                      <span key={index} className="px-2 py-1 text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full">{attr}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        Tag
                      </label>
                      <input
                        type="text"
                        value={tag}
                        onChange={(e) => setTag(e.target.value)}
                        className="w-full px-3 py-2 border border-border-secondary rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-text-primary"
                        required
                        placeholder="default"
                      />
                    </div>

                    {/* Revocation checkbox - not applicable for mdoc format */}
                    {credentialFormat !== 'mso_mdoc' && (
                      <div className="mb-4 flex items-center">
                        <input
                          type="checkbox"
                          id="supportRevocation"
                          checked={supportRevocation}
                          onChange={(e) => setSupportRevocation(e.target.checked)}
                          className="h-4 w-4 text-primary-600 focus:ring-blue-500 border-border-secondary rounded"
                        />
                        <label htmlFor="supportRevocation" className="ml-2 block text-sm text-text-secondary">
                          Support Revocation
                        </label>
                      </div>
                    )}

                    {/* Credential Designer Template Section */}
                    <div className="mb-4 border-t pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-text-secondary">Credential Card Design</h4>
                        <Link
                          href="/credential-designer"
                          target="_blank"
                          className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                          Create New Design
                        </Link>
                      </div>

                      <div className="mb-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={useDesignerTemplate}
                            onChange={(e) => {
                              setUseDesignerTemplate(e.target.checked);
                              if (!e.target.checked) {
                                setSelectedTemplateId('');
                                // Reset to defaults
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
                                  logo: '',
                                  background_image: '',
                                });
                              }
                            }}
                            className="h-4 w-4 text-primary-600 focus:ring-blue-500 border-border-secondary rounded"
                          />
                          <span className="text-sm text-text-secondary">Use a saved card design template</span>
                        </label>
                      </div>

                      {useDesignerTemplate && (
                        <div className="mb-4">
                          {loadingTemplates ? (
                            <div className="flex items-center gap-2 text-sm text-text-tertiary">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-500"></div>
                              Loading templates...
                            </div>
                          ) : designerTemplates.length > 0 ? (
                            <div>
                              <label className="block text-sm font-medium text-text-secondary mb-2">
                                Select Card Design Template
                              </label>
                              <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                                {designerTemplates.map((template) => (
                                  <div
                                    key={template.id}
                                    onClick={() => handleTemplateSelect(template.id)}
                                    className={`p-3 border rounded-lg cursor-pointer transition-all ${
                                      selectedTemplateId === template.id
                                        ? 'border-primary-500 bg-blue-50 ring-2 ring-blue-200'
                                        : 'border-border-secondary hover:border-border-secondary hover:bg-surface-100 dark:bg-surface-800'
                                    }`}
                                  >
                                    {/* Template Preview */}
                                    <div
                                      className="h-16 rounded mb-2 flex items-center justify-center text-white text-xs font-medium"
                                      style={{
                                        background: template.oca_branding?.primary_background_color
                                          ? `linear-gradient(135deg, ${template.oca_branding.primary_background_color}, ${template.oca_branding.secondary_background_color || template.oca_branding.primary_background_color})`
                                          : 'linear-gradient(135deg, #1e3a5f, #0f1f33)',
                                      }}
                                    >
                                      {template.oca_branding?.logo ? (
                                        <img
                                          src={template.oca_branding.logo}
                                          alt=""
                                          className="h-8 w-auto object-contain"
                                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                      ) : (
                                        <span className="opacity-75">{template.name?.substring(0, 2).toUpperCase()}</span>
                                      )}
                                    </div>
                                    <p className="text-sm font-medium text-text-primary truncate">{template.name}</p>
                                    {template.category && (
                                      <p className="text-xs text-text-tertiary capitalize">{template.category}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {selectedTemplateId && (
                                <p className="mt-2 text-xs text-success-600 dark:text-success-400 flex items-center gap-1">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  OCA fields auto-filled from template
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="text-center py-4 bg-surface-100 dark:bg-surface-800 rounded-lg">
                              <p className="text-sm text-text-tertiary mb-2">No saved templates found</p>
                              <Link
                                href="/credential-designer"
                                className="text-sm text-primary-600 hover:text-primary-700"
                              >
                                Create your first card design →
                              </Link>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* OCA Overlay Section */}
                    <div className="mb-4 border-t pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-text-secondary">
                          OCA Overlay (Branding)
                          {selectedTemplateId && <span className="ml-2 text-xs text-success-600 dark:text-success-400">(from template)</span>}
                        </h4>
                        <button
                          type="button"
                          onClick={() => setShowOverlayFields(!showOverlayFields)}
                          className="text-sm text-primary-600 hover:text-primary-700"
                        >
                          {showOverlayFields ? 'Hide' : 'Show'} Options
                        </button>
                      </div>

                      {showOverlayFields && (
                        <div className="space-y-4 bg-surface-100 dark:bg-surface-800 p-4 rounded-md">
                          {/* Meta Section */}
                          <div>
                            <h5 className="text-xs font-semibold text-text-secondary uppercase mb-2">Credential Metadata</h5>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-text-secondary mb-1">Display Name</label>
                                <input
                                  type="text"
                                  value={overlayMeta.name}
                                  onChange={(e) => setOverlayMeta({ ...overlayMeta, name: e.target.value })}
                                  className="w-full px-2 py-1.5 text-sm border border-border-secondary rounded focus:ring-primary-500 focus:border-primary-500 text-text-primary"
                                  placeholder="e.g., Student ID Card"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-text-secondary mb-1">Issuer Name</label>
                                <input
                                  type="text"
                                  value={overlayMeta.issuer}
                                  onChange={(e) => setOverlayMeta({ ...overlayMeta, issuer: e.target.value })}
                                  className="w-full px-2 py-1.5 text-sm border border-border-secondary rounded focus:ring-primary-500 focus:border-primary-500 text-text-primary"
                                  placeholder="e.g., University of Example"
                                />
                              </div>
                              <div className="col-span-2">
                                <label className="block text-xs text-text-secondary mb-1">Description</label>
                                <textarea
                                  value={overlayMeta.description}
                                  onChange={(e) => setOverlayMeta({ ...overlayMeta, description: e.target.value })}
                                  className="w-full px-2 py-1.5 text-sm border border-border-secondary rounded focus:ring-primary-500 focus:border-primary-500 text-text-primary"
                                  rows={2}
                                  placeholder="Describe what this credential represents..."
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-text-secondary mb-1">Issuer URL</label>
                                <input
                                  type="url"
                                  value={overlayMeta.issuer_url}
                                  onChange={(e) => setOverlayMeta({ ...overlayMeta, issuer_url: e.target.value })}
                                  className="w-full px-2 py-1.5 text-sm border border-border-secondary rounded focus:ring-primary-500 focus:border-primary-500 text-text-primary"
                                  placeholder="https://example.edu"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-text-secondary mb-1">Issuer Description</label>
                                <input
                                  type="text"
                                  value={overlayMeta.issuer_description}
                                  onChange={(e) => setOverlayMeta({ ...overlayMeta, issuer_description: e.target.value })}
                                  className="w-full px-2 py-1.5 text-sm border border-border-secondary rounded focus:ring-primary-500 focus:border-primary-500 text-text-primary"
                                  placeholder="Brief issuer description"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Branding Section */}
                          <div>
                            <h5 className="text-xs font-semibold text-text-secondary uppercase mb-2">Visual Branding</h5>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-text-secondary mb-1">Primary Color</label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={overlayBranding.primary_background_color}
                                    onChange={(e) => setOverlayBranding({ ...overlayBranding, primary_background_color: e.target.value })}
                                    className="h-8 w-8 rounded border border-border-secondary cursor-pointer"
                                  />
                                  <input
                                    type="text"
                                    value={overlayBranding.primary_background_color}
                                    onChange={(e) => setOverlayBranding({ ...overlayBranding, primary_background_color: e.target.value })}
                                    className="flex-1 px-2 py-1.5 text-sm border border-border-secondary rounded text-text-primary"
                                    placeholder="#FFFFFF"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs text-text-secondary mb-1">Secondary Color</label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={overlayBranding.secondary_background_color}
                                    onChange={(e) => setOverlayBranding({ ...overlayBranding, secondary_background_color: e.target.value })}
                                    className="h-8 w-8 rounded border border-border-secondary cursor-pointer"
                                  />
                                  <input
                                    type="text"
                                    value={overlayBranding.secondary_background_color}
                                    onChange={(e) => setOverlayBranding({ ...overlayBranding, secondary_background_color: e.target.value })}
                                    className="flex-1 px-2 py-1.5 text-sm border border-border-secondary rounded text-text-primary"
                                    placeholder="#F5F5F5"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs text-text-secondary mb-1">Primary Attribute</label>
                                <input
                                  type="text"
                                  value={overlayBranding.primary_attribute}
                                  onChange={(e) => setOverlayBranding({ ...overlayBranding, primary_attribute: e.target.value })}
                                  className="w-full px-2 py-1.5 text-sm border border-border-secondary rounded focus:ring-primary-500 focus:border-primary-500 text-text-primary"
                                  placeholder="e.g., name"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-text-secondary mb-1">Secondary Attribute</label>
                                <input
                                  type="text"
                                  value={overlayBranding.secondary_attribute}
                                  onChange={(e) => setOverlayBranding({ ...overlayBranding, secondary_attribute: e.target.value })}
                                  className="w-full px-2 py-1.5 text-sm border border-border-secondary rounded focus:ring-primary-500 focus:border-primary-500 text-text-primary"
                                  placeholder="e.g., studentId"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-text-secondary mb-1">Logo URL</label>
                                <input
                                  type="url"
                                  value={overlayBranding.logo}
                                  onChange={(e) => setOverlayBranding({ ...overlayBranding, logo: e.target.value })}
                                  className="w-full px-2 py-1.5 text-sm border border-border-secondary rounded focus:ring-primary-500 focus:border-primary-500 text-text-primary"
                                  placeholder="https://example.edu/logo.png"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-text-secondary mb-1">Background Image URL</label>
                                <input
                                  type="url"
                                  value={overlayBranding.background_image}
                                  onChange={(e) => setOverlayBranding({ ...overlayBranding, background_image: e.target.value })}
                                  className="w-full px-2 py-1.5 text-sm border border-border-secondary rounded focus:ring-primary-500 focus:border-primary-500 text-text-primary"
                                  placeholder="https://example.edu/bg.png"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-6 flex justify-end space-x-3">
                      <button
                        type="button"
                        onClick={closeModal}
                        className="px-4 py-2 border border-border-secondary rounded-md text-text-secondary hover:bg-surface-100 dark:bg-surface-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
                        disabled={
                          creating ||
                          !tag ||
                          (credentialFormat !== 'mso_mdoc' && !selectedSchemaId) ||
                          (credentialFormat === 'mso_mdoc' && mdocSelectedAttributes.length === 0)
                        }
                      >
                        {creating ? 'Creating...' : 'Create Credential Definition'}
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Credential Definition Details Modal */}
      <Transition appear show={isDetailsOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={closeDetailsModal}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-surface-50 dark:bg-surface-900 p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-text-primary mb-4">
                    Credential Definition Details
                  </Dialog.Title>

                  {selectedCredDef && (
                    <div>
                      <div className="mb-6 grid grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-sm font-semibold text-text-secondary mb-1">ID</h4>
                          <p className="text-sm text-text-secondary break-all">{selectedCredDef.credentialDefinitionId || 'N/A'}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-text-secondary mb-1">Internal ID</h4>
                          <p className="text-sm text-text-secondary break-all">{selectedCredDef.id}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-text-secondary mb-1">Issuer DID</h4>
                          <p className="text-sm text-text-secondary break-all">{selectedCredDef.issuerId || 'N/A'}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-text-secondary mb-1">Schema ID</h4>
                          <p className="text-sm text-text-secondary break-all">{selectedCredDef.schemaId || 'N/A'}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-text-secondary mb-1">Tag</h4>
                          <p className="text-sm text-text-secondary">{selectedCredDef.tag || 'N/A'}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-text-secondary mb-1">Method</h4>
                          <p className="text-sm text-text-secondary">{selectedCredDef.methodName || 'kanon'}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-text-secondary mb-1">Created</h4>
                          <p className="text-sm text-text-secondary">
                            {selectedCredDef.createdAt
                              ? new Date(selectedCredDef.createdAt).toLocaleString()
                              : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-text-secondary mb-1">Updated</h4>
                          <p className="text-sm text-text-secondary">
                            {selectedCredDef.updatedAt
                              ? new Date(selectedCredDef.updatedAt).toLocaleString()
                              : 'N/A'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4">
                        <h4 className="text-sm font-semibold text-text-secondary mb-2">Schema Details</h4>
                        {loadingSchema ? (
                          <div className="flex items-center justify-center p-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
                            <span className="ml-2 text-sm text-text-secondary">Loading schema details...</span>
                          </div>
                        ) : schemaDetails ? (
                          <div className="bg-surface-100 dark:bg-surface-800 p-4 rounded border border-border-secondary">
                            <div className="grid grid-cols-2 gap-3 mb-4">
                              <div>
                                <h5 className="text-xs font-semibold text-text-secondary mb-1">Schema ID</h5>
                                <p className="text-sm text-text-secondary break-all">{schemaDetails.schemaId}</p>
                              </div>
                              <div>
                                <h5 className="text-xs font-semibold text-text-secondary mb-1">Internal ID</h5>
                                <p className="text-sm text-text-secondary">{schemaDetails.id}</p>
                              </div>
                              <div>
                                <h5 className="text-xs font-semibold text-text-secondary mb-1">Name</h5>
                                <p className="text-sm text-text-secondary">{schemaDetails.schema?.name || 'N/A'}</p>
                              </div>
                              <div>
                                <h5 className="text-xs font-semibold text-text-secondary mb-1">Version</h5>
                                <p className="text-sm text-text-secondary">{schemaDetails.schema?.version || 'N/A'}</p>
                              </div>
                              <div>
                                <h5 className="text-xs font-semibold text-text-secondary mb-1">Issuer</h5>
                                <p className="text-sm text-text-secondary break-all">{schemaDetails.schema?.issuerId || 'N/A'}</p>
                              </div>
                              <div>
                                <h5 className="text-xs font-semibold text-text-secondary mb-1">Method</h5>
                                <p className="text-sm text-text-secondary">{schemaDetails.methodName || 'kanon'}</p>
                              </div>
                              <div>
                                <h5 className="text-xs font-semibold text-text-secondary mb-1">Created</h5>
                                <p className="text-sm text-text-secondary">
                                  {schemaDetails.createdAt ? new Date(schemaDetails.createdAt).toLocaleString() : 'N/A'}
                                </p>
                              </div>
                              <div>
                                <h5 className="text-xs font-semibold text-text-secondary mb-1">Updated</h5>
                                <p className="text-sm text-text-secondary">
                                  {schemaDetails.updatedAt ? new Date(schemaDetails.updatedAt).toLocaleString() : 'N/A'}
                                </p>
                              </div>
                            </div>
                            
                            {schemaDetails.schema?.attrNames && schemaDetails.schema.attrNames.length > 0 && (
                              <div>
                                <h5 className="text-xs font-semibold text-text-secondary mb-2">Attributes</h5>
                                <div className="flex flex-wrap gap-2">
                                  {schemaDetails.schema.attrNames.map((attr, idx) => (
                                    <span key={idx} className="px-2 py-1 text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full">
                                      {attr}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-text-tertiary italic">
                            {selectedCredDef?.schemaId ? 'Failed to load schema details' : 'No schema associated with this credential definition'}
                          </p>
                        )}
                      </div>

                      {/* OCA Overlay Section */}
                      {selectedCredDef?.credentialDefinitionId && (
                        <div className="mt-6">
                          <h4 className="text-sm font-semibold text-text-secondary mb-2">OCA Overlay (Branding)</h4>
                          {loadingOverlay ? (
                            <div className="flex items-center justify-center p-4">
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
                              <span className="ml-2 text-sm text-text-secondary">Loading overlay...</span>
                            </div>
                          ) : overlayData ? (
                            <div className="bg-gradient-to-r from-surface-100 to-surface-200 dark:from-surface-800 dark:to-surface-700 p-4 rounded-lg border border-border-secondary">
                              {/* Preview Card */}
                              {(overlayData.branding || overlayData.meta) && (
                                <div className="mb-4">
                                  <h5 className="text-xs font-semibold text-text-secondary uppercase mb-2">Preview</h5>
                                  <div className="flex justify-center">
                                    <div
                                      className="relative w-full max-w-xl rounded-2xl overflow-hidden shadow-md"
                                      style={{
                                        aspectRatio: '1.6 / 1',
                                        background: overlayData.branding?.secondary_background_color
                                          ? `linear-gradient(135deg, ${overlayData.branding?.primary_background_color || '#1e3a5f'}, ${overlayData.branding.secondary_background_color})`
                                          : overlayData.branding?.primary_background_color || '#1e3a5f',
                                      }}
                                    >
                                      {overlayData.branding?.background_image && (
                                        <img
                                          src={overlayData.branding.background_image}
                                          alt="Card background"
                                          className="absolute inset-0 h-full w-full object-cover opacity-90"
                                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                      )}
                                      <div className="relative z-10 flex h-full flex-col justify-between p-4 text-white">
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="text-sm font-semibold tracking-wide">
                                            {overlayData.meta?.issuer || overlayData.meta?.name || 'Credential'}
                                          </div>
                                          {overlayData.branding?.logo && (
                                            <img
                                              src={overlayData.branding.logo}
                                              alt="Credential logo"
                                              className="h-10 w-auto object-contain"
                                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                          )}
                                        </div>
                                        <div className="space-y-1">
                                          {overlayData.meta?.name && (
                                            <div className="text-lg font-semibold">{overlayData.meta.name}</div>
                                          )}
                                          {overlayData.branding?.primary_attribute && (
                                            <div className="text-base font-semibold">
                                              {'{{'}
                                              {overlayData.branding.primary_attribute}
                                              {'}}'}
                                            </div>
                                          )}
                                          {overlayData.branding?.secondary_attribute && (
                                            <div className="text-sm opacity-80">
                                              {'{{'}
                                              {overlayData.branding.secondary_attribute}
                                              {'}}'}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Meta Information */}
                              {overlayData.meta && (
                                <div className="mb-4">
                                  <h5 className="text-xs font-semibold text-text-secondary uppercase mb-2">Metadata</h5>
                                  <div className="grid grid-cols-2 gap-3">
                                    {overlayData.meta.name && (
                                      <div>
                                        <p className="text-xs text-text-tertiary">Display Name</p>
                                        <p className="text-sm text-text-primary font-medium">{overlayData.meta.name}</p>
                                      </div>
                                    )}
                                    {overlayData.meta.issuer && (
                                      <div>
                                        <p className="text-xs text-text-tertiary">Issuer</p>
                                        <p className="text-sm text-text-primary font-medium">{overlayData.meta.issuer}</p>
                                      </div>
                                    )}
                                    {overlayData.meta.description && (
                                      <div className="col-span-2">
                                        <p className="text-xs text-text-tertiary">Description</p>
                                        <p className="text-sm text-text-primary">{overlayData.meta.description}</p>
                                      </div>
                                    )}
                                    {overlayData.meta.issuer_url && (
                                      <div>
                                        <p className="text-xs text-text-tertiary">Issuer URL</p>
                                        <a href={overlayData.meta.issuer_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-600 hover:underline">
                                          {overlayData.meta.issuer_url}
                                        </a>
                                      </div>
                                    )}
                                    {overlayData.meta.issuer_description && (
                                      <div>
                                        <p className="text-xs text-text-tertiary">Issuer Description</p>
                                        <p className="text-sm text-text-primary">{overlayData.meta.issuer_description}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Branding Information */}
                              {overlayData.branding && (
                                <div>
                                  <h5 className="text-xs font-semibold text-text-secondary uppercase mb-2">Branding</h5>
                                  <div className="grid grid-cols-2 gap-3">
                                    {overlayData.branding.primary_background_color && (
                                      <div className="flex items-center gap-2">
                                        <div
                                          className="w-6 h-6 rounded border border-border-secondary"
                                          style={{ backgroundColor: overlayData.branding.primary_background_color }}
                                        />
                                        <div>
                                          <p className="text-xs text-text-tertiary">Primary Color</p>
                                          <p className="text-sm text-text-primary font-mono">{overlayData.branding.primary_background_color}</p>
                                        </div>
                                      </div>
                                    )}
                                    {overlayData.branding.secondary_background_color && (
                                      <div className="flex items-center gap-2">
                                        <div
                                          className="w-6 h-6 rounded border border-border-secondary"
                                          style={{ backgroundColor: overlayData.branding.secondary_background_color }}
                                        />
                                        <div>
                                          <p className="text-xs text-text-tertiary">Secondary Color</p>
                                          <p className="text-sm text-text-primary font-mono">{overlayData.branding.secondary_background_color}</p>
                                        </div>
                                      </div>
                                    )}
                                    {overlayData.branding.primary_attribute && (
                                      <div>
                                        <p className="text-xs text-text-tertiary">Primary Attribute</p>
                                        <p className="text-sm text-text-primary">{overlayData.branding.primary_attribute}</p>
                                      </div>
                                    )}
                                    {overlayData.branding.secondary_attribute && (
                                      <div>
                                        <p className="text-xs text-text-tertiary">Secondary Attribute</p>
                                        <p className="text-sm text-text-primary">{overlayData.branding.secondary_attribute}</p>
                                      </div>
                                    )}
                                    {overlayData.branding.logo && (
                                      <div className="col-span-2">
                                        <p className="text-xs text-text-tertiary">Logo URL</p>
                                        <p className="text-sm text-text-primary font-mono break-all">{overlayData.branding.logo}</p>
                                      </div>
                                    )}
                                    {overlayData.branding.background_image && (
                                      <div className="col-span-2">
                                        <p className="text-xs text-text-tertiary">Background Image URL</p>
                                        <p className="text-sm text-text-primary font-mono break-all">{overlayData.branding.background_image}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-text-tertiary italic bg-surface-100 dark:bg-surface-800 p-3 rounded">
                              No OCA overlay configured for this credential definition.
                            </p>
                          )}
                        </div>
                      )}

                      <div className="mt-6 flex justify-end">
                        <button
                          type="button"
                          onClick={closeDetailsModal}
                          className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  )}
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
} 
