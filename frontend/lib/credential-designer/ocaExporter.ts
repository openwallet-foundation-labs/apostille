import {
  CraftState,
  CraftNode,
  OCAOverlay,
  OCABranding,
  OCAMeta,
  CardContainerProps,
  TextNodeProps,
  ImageNodeProps,
  AttributeNodeProps,
} from './types';

/**
 * Exports Craft.js state to OCA (Overlay Capture Architecture) format
 *
 * This maps visual design elements to OCA branding and meta fields:
 * - CardContainer background -> primary_background_color, secondary_background_color
 * - ImageNode with role=logo -> branding.logo
 * - ImageNode with role=background -> branding.background_image
 * - AttributeNode with role=primary -> branding.primary_attribute
 * - AttributeNode with role=secondary -> branding.secondary_attribute
 * - TextNode with isMetaField=true -> meta fields (issuer, name, etc.)
 */
export function exportCraftStateToOCA(craftState: CraftState): OCAOverlay {
  const overlay: OCAOverlay = {
    meta: {},
    branding: {},
  };

  // Get root container for background colors and image
  const rootNode = craftState.ROOT;
  if (rootNode) {
    const props = rootNode.props as unknown as CardContainerProps;

    // Extract background color
    if (props.backgroundColor) {
      overlay.branding!.primary_background_color = props.backgroundColor;
    }

    // Extract secondary color from gradient
    if (props.backgroundGradient?.colors && props.backgroundGradient.colors.length > 1) {
      overlay.branding!.secondary_background_color = props.backgroundGradient.colors[1];
    }

    // Extract background image from CardContainer (takes priority over ImageNode with role=background)
    if (props.backgroundImage) {
      overlay.branding!.background_image = props.backgroundImage;
    }
  }

  // Traverse all nodes to find special elements
  for (const [nodeId, node] of Object.entries(craftState)) {
    if (nodeId === 'ROOT') continue;

    const typeName = node.type?.resolvedName;

    switch (typeName) {
      case 'ImageNode': {
        const props = node.props as unknown as ImageNodeProps;
        // Prefer public URL over base64 for OCA (smaller payload, better wallet support)
        const imageUrl = props.publicUrl || props.src;
        if (props.role === 'logo' && imageUrl) {
          overlay.branding!.logo = imageUrl;
        } else if (props.role === 'background' && imageUrl && !overlay.branding!.background_image) {
          // Only set if CardContainer doesn't already have a background image
          overlay.branding!.background_image = imageUrl;
        }
        break;
      }

      case 'AttributeNode': {
        const props = node.props as unknown as AttributeNodeProps;
        if (props.role === 'primary' && props.attributeName) {
          overlay.branding!.primary_attribute = props.attributeName;
        } else if (props.role === 'secondary' && props.attributeName) {
          overlay.branding!.secondary_attribute = props.attributeName;
        }
        // Check for date role attributes
        const extendedProps = props as AttributeNodeProps & { dateRole?: 'issued' | 'expiry' };
        if (extendedProps.dateRole === 'issued' && props.attributeName) {
          overlay.branding!.issued_date_attribute = props.attributeName;
        } else if (extendedProps.dateRole === 'expiry' && props.attributeName) {
          overlay.branding!.expiry_date_attribute = props.attributeName;
        }
        break;
      }

      case 'TextNode': {
        const props = node.props as unknown as TextNodeProps;
        if (props.isMetaField && props.metaKey) {
          switch (props.metaKey) {
            case 'name':
              overlay.meta!.name = props.text;
              break;
            case 'description':
              overlay.meta!.description = props.text;
              break;
            case 'issuer':
              overlay.meta!.issuer = props.text;
              break;
            case 'issuer_url':
              overlay.meta!.issuer_url = props.text;
              break;
            case 'issuer_description':
              overlay.meta!.issuer_description = props.text;
              break;
          }
        }
        break;
      }
    }
  }

  // Clean up empty objects
  if (overlay.meta && Object.keys(overlay.meta).length === 0) {
    delete overlay.meta;
  }
  if (overlay.branding && Object.keys(overlay.branding).length === 0) {
    delete overlay.branding;
  }

  return overlay;
}

export function getSvgBindingsFromCraftState(craftState: CraftState): Record<string, string> {
  const bindings: Record<string, string> = {};

  for (const [nodeId, node] of Object.entries(craftState)) {
    if (nodeId === 'ROOT') continue;
    if (node.type?.resolvedName !== 'AttributeNode') continue;

    const props = node.props as unknown as AttributeNodeProps;
    if (props.attributeName) {
      bindings[props.attributeName] = props.attributeName;
    }
    const displayLabel = (props.displayLabel || '').trim();
    if (displayLabel && displayLabel !== props.attributeName) {
      bindings[displayLabel] = props.attributeName;
    }
  }

  return bindings;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function transformText(value: string, transform: TextNodeProps['textTransform']): string {
  if (!value) return value;
  switch (transform) {
    case 'uppercase':
      return value.toUpperCase();
    case 'lowercase':
      return value.toLowerCase();
    case 'capitalize':
      return value.replace(/\b\w/g, (c) => c.toUpperCase());
    default:
      return value;
  }
}

function gradientCoords(angleDegrees: number): { x1: number; y1: number; x2: number; y2: number } {
  const radians = (angleDegrees * Math.PI) / 180;
  const x = Math.cos(radians);
  const y = Math.sin(radians);
  return {
    x1: 0.5 - x * 0.5,
    y1: 0.5 - y * 0.5,
    x2: 0.5 + x * 0.5,
    y2: 0.5 + y * 0.5,
  };
}

export function generateSvgTemplateFromCraftState(
  craftState: CraftState,
  width: number,
  height: number
): string {
  const defs: string[] = [];
  const elements: string[] = [];
  const metadata: string[] = [];

  // External attribution for OCA overlays.
  metadata.push(`<externalAttribution>Color</externalAttribution>`);

  const rootNode = craftState.ROOT;
  if (rootNode) {
    const props = rootNode.props as unknown as CardContainerProps;
    const borderRadius = props.borderRadius ?? 0;

    if (props.backgroundGradient?.colors && props.backgroundGradient.colors.length > 1) {
      const angle = props.backgroundGradient.angle ?? 135;
      const coords = gradientCoords(angle);
      const gradientId = 'bgGradient';
      defs.push(
        `<linearGradient id="${gradientId}" x1="${coords.x1}" y1="${coords.y1}" x2="${coords.x2}" y2="${coords.y2}">` +
          `<stop offset="0%" stop-color="${props.backgroundGradient.colors[0]}" />` +
          `<stop offset="100%" stop-color="${props.backgroundGradient.colors[1]}" />` +
        `</linearGradient>`
      );
      elements.push(
        `<rect x="0" y="0" width="${width}" height="${height}" rx="${borderRadius}" ry="${borderRadius}" fill="url(#${gradientId})" />`
      );
    } else if (props.backgroundColor) {
      elements.push(
        `<rect x="0" y="0" width="${width}" height="${height}" rx="${borderRadius}" ry="${borderRadius}" fill="${props.backgroundColor}" />`
      );
    }

    if (props.backgroundImage && !props.backgroundImage.startsWith('data:')) {
      elements.push(
        `<image href="${escapeXml(props.backgroundImage)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />`
      );
    }
  }

  for (const [nodeId, node] of Object.entries(craftState)) {
    if (nodeId === 'ROOT') continue;
    const typeName = node.type?.resolvedName;

    if (typeName === 'ImageNode') {
      const props = node.props as unknown as ImageNodeProps;
      const src = props.publicUrl || props.src;
      if (!src || src.startsWith('data:')) continue;
      const x = props.x ?? 0;
      const y = props.y ?? 0;
      const w = props.width ?? 40;
      const h = props.height ?? 40;
      elements.push(
        `<image href="${escapeXml(src)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" />`
      );
      continue;
    }

    if (typeName === 'TextNode') {
      const props = node.props as unknown as TextNodeProps;
      const rawText =
        props.isMetaField && props.metaKey
          ? `{{meta.${props.metaKey}}}`
          : props.text || '';
      const text = escapeXml(transformText(rawText, props.textTransform));
      const x = props.x ?? 0;
      const y = props.y ?? 0;
      const fontWeight =
        props.fontWeight === 'medium' ? 500 : props.fontWeight === 'semibold' ? 600 : props.fontWeight;
      const textAnchor =
        props.textAlign === 'center' ? 'middle' : props.textAlign === 'right' ? 'end' : 'start';
      const anchorX =
        props.textAlign === 'center' && props.width ? x + props.width / 2
          : props.textAlign === 'right' && props.width ? x + props.width
          : x;

      elements.push(
        `<text x="${anchorX}" y="${y}" fill="${props.color}" font-size="${props.fontSize}" font-family="${escapeXml(props.fontFamily)}" font-weight="${fontWeight}" text-anchor="${textAnchor}" dominant-baseline="text-before-edge" letter-spacing="${props.letterSpacing || 0}">${text}</text>`
      );
      continue;
    }

    if (typeName === 'AttributeNode') {
      const props = node.props as unknown as AttributeNodeProps;
      const placeholderKey = (props.displayLabel || props.attributeName || '').trim();
      const placeholder = `{{${placeholderKey}}}`;
      const text = escapeXml(placeholder);
      const x = props.x ?? 0;
      const y = props.y ?? 0;
      const fontWeight =
        props.fontWeight === 'medium' ? 500 : props.fontWeight === 'semibold' ? 600 : props.fontWeight;
      const textAnchor =
        props.textAlign === 'center' ? 'middle' : props.textAlign === 'right' ? 'end' : 'start';

      elements.push(
        `<text x="${x}" y="${y}" fill="${props.color}" font-size="${props.fontSize}" font-family="Inter" font-weight="${fontWeight}" text-anchor="${textAnchor}" dominant-baseline="text-before-edge">${text}</text>`
      );
    }
  }

  const metadataBlock = metadata.length > 0 ? `<metadata>${metadata.join('')}</metadata>` : '';
  const defsBlock = defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${metadataBlock}${defsBlock}${elements.join('')}</svg>`;
}

/**
 * Imports OCA overlay data into Craft.js state
 * Updates existing nodes with OCA branding/meta values
 */
export function importOCAToCraftState(
  craftState: CraftState,
  overlay: OCAOverlay
): CraftState {
  const newState = { ...craftState };

  // Update root container with colors and background image
  if (newState.ROOT && overlay.branding) {
    const props = { ...newState.ROOT.props } as unknown as CardContainerProps;

    if (overlay.branding.primary_background_color) {
      props.backgroundColor = overlay.branding.primary_background_color;
    }

    if (overlay.branding.secondary_background_color && props.backgroundGradient) {
      props.backgroundGradient = {
        ...props.backgroundGradient,
        colors: [
          props.backgroundGradient.colors[0] || props.backgroundColor,
          overlay.branding.secondary_background_color,
        ],
      };
    }

    if (overlay.branding.background_image) {
      props.backgroundImage = overlay.branding.background_image;
    }

    newState.ROOT = {
      ...newState.ROOT,
      props: props as unknown as Record<string, unknown>,
    };
  }

  // Update nodes based on overlay data
  for (const [nodeId, node] of Object.entries(newState)) {
    if (nodeId === 'ROOT') continue;

    const typeName = node.type?.resolvedName;

    switch (typeName) {
      case 'ImageNode': {
        const props = node.props as unknown as ImageNodeProps;
        if (props.role === 'logo' && overlay.branding?.logo) {
          newState[nodeId] = {
            ...node,
            props: { ...props, src: overlay.branding.logo },
          };
        } else if (props.role === 'background' && overlay.branding?.background_image) {
          newState[nodeId] = {
            ...node,
            props: { ...props, src: overlay.branding.background_image },
          };
        }
        break;
      }

      case 'TextNode': {
        const props = node.props as unknown as TextNodeProps;
        if (props.isMetaField && props.metaKey && overlay.meta) {
          const metaValue = overlay.meta[props.metaKey as keyof OCAMeta];
          if (metaValue) {
            newState[nodeId] = {
              ...node,
              props: { ...props, text: metaValue },
            };
          }
        }
        break;
      }
    }
  }

  return newState;
}

/**
 * Validates OCA overlay structure
 */
export function validateOCAOverlay(overlay: OCAOverlay): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate branding colors if present
  if (overlay.branding?.primary_background_color) {
    if (!isValidHexColor(overlay.branding.primary_background_color)) {
      errors.push('primary_background_color must be a valid hex color');
    }
  }

  if (overlay.branding?.secondary_background_color) {
    if (!isValidHexColor(overlay.branding.secondary_background_color)) {
      errors.push('secondary_background_color must be a valid hex color');
    }
  }

  // Validate URLs if present
  if (overlay.meta?.issuer_url) {
    if (!isValidUrl(overlay.meta.issuer_url)) {
      errors.push('issuer_url must be a valid URL');
    }
  }

  // Validate image data if present
  if (overlay.branding?.logo) {
    if (!isValidImageData(overlay.branding.logo)) {
      errors.push('logo must be a valid base64 data URL or URL');
    }
  }

  if (overlay.branding?.background_image) {
    if (!isValidImageData(overlay.branding.background_image)) {
      errors.push('background_image must be a valid base64 data URL or URL');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Helper functions
function isValidHexColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function isValidImageData(data: string): boolean {
  // Check for base64 data URL
  if (data.startsWith('data:image/')) {
    return true;
  }
  // Check for URL
  return isValidUrl(data);
}

/**
 * Extracts primary attribute value from credential data using OCA branding
 */
export function getPrimaryAttributeValue(
  credentialData: Record<string, unknown>,
  overlay: OCAOverlay
): string | null {
  const attrName = overlay.branding?.primary_attribute;
  if (!attrName || !credentialData[attrName]) {
    return null;
  }
  return String(credentialData[attrName]);
}

/**
 * Extracts secondary attribute value from credential data using OCA branding
 */
export function getSecondaryAttributeValue(
  credentialData: Record<string, unknown>,
  overlay: OCAOverlay
): string | null {
  const attrName = overlay.branding?.secondary_attribute;
  if (!attrName || !credentialData[attrName]) {
    return null;
  }
  return String(credentialData[attrName]);
}
