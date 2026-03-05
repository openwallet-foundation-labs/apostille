'use client';

import React, { useRef, useState, useCallback } from 'react';
import { useEditor, useNode } from '@craftjs/core';
import { ImageNodeProps } from '@/lib/credential-designer/types';
import { credentialDesignerApi } from '@/lib/credential-designer/api';
import { useDesignerStore } from '@/lib/credential-designer/store';
import { useDragMove } from '../hooks/useDragMove';
import { useDesignerContext } from '../context/DesignerContext';

const defaultProps: ImageNodeProps = {
  src: '',
  assetId: undefined,
  publicUrl: undefined,
  width: 60,
  height: 60,
  borderRadius: 8,
  opacity: 1,
  objectFit: 'contain',
  role: 'decoration',
  x: 0,
  y: 0,
};

export const ImageNode: React.FC<Partial<ImageNodeProps>> = (props) => {
  const mergedProps = { ...defaultProps, ...props };
  const {
    src,
    width,
    height,
    borderRadius,
    opacity,
    objectFit,
    role,
    x,
    y,
  } = mergedProps;

  const {
    connectors: { connect, drag },
    selected,
    actions: { setProp },
  } = useNode((state) => ({
    selected: state.events.selected,
  }));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentTemplate = useDesignerStore((state) => state.currentTemplate);
  const [isUploading, setIsUploading] = useState(false);
  const { zoom, cardBounds } = useDesignerContext();

  // Stable callback for position updates
  const handleMove = useCallback(
    (newX: number, newY: number) => {
      setProp((props: ImageNodeProps) => {
        props.x = newX;
        props.y = newY;
      });
    },
    [setProp]
  );

  // Custom drag to move on canvas
  const { onMouseDown, isDragging, displayX, displayY } = useDragMove({
    x,
    y,
    onMove: handleMove,
    enabled: selected,
    zoom,
    bounds: cardBounds,
    elementSize: { width, height },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // First, show the image immediately using base64
    const reader = new FileReader();
    reader.onload = () => {
      setProp((props: ImageNodeProps) => (props.src = reader.result as string));
    };
    reader.readAsDataURL(file);

    // Then upload to API to get public URL for OCA
    setIsUploading(true);
    try {
      const assetType = role === 'logo' ? 'logo' : role === 'background' ? 'background' : 'decoration';
      const result = await credentialDesignerApi.uploadFile(
        file,
        assetType,
        currentTemplate?.id
      );

      if (result.success && result.asset) {
        setProp((props: ImageNodeProps) => {
          props.assetId = result.asset.id;
          props.publicUrl = result.asset.public_url;
        });
      }
    } catch (error) {
      console.error('Failed to upload image to server:', error);
      // Image still displays via base64, just won't have public URL for OCA
    } finally {
      setIsUploading(false);
    }
  };

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${displayX}px`,
    top: `${displayY}px`,
    width: `${width}px`,
    height: `${height}px`,
    borderRadius: `${borderRadius}px`,
    opacity: isDragging ? opacity * 0.8 : opacity,
    cursor: isDragging ? 'grabbing' : 'move',
    outline: selected ? '2px solid #3b82f6' : 'none',
    outlineOffset: '2px',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: isDragging ? 'none' : 'opacity 0.15s ease',
  };

  const placeholderStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    border: '2px dashed rgba(255, 255, 255, 0.3)',
    borderRadius: `${borderRadius}px`,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '12px',
    cursor: 'pointer',
  };

  const getRoleLabel = () => {
    switch (role) {
      case 'logo':
        return 'Logo';
      case 'background':
        return 'BG';
      default:
        return 'Image';
    }
  };

  return (
    <div
      ref={(ref) => { if (ref) connect(drag(ref)); }}
      style={style}
      className="image-node"
      onMouseDown={onMouseDown}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageUpload}
        accept="image/*"
        className="hidden"
      />

      {src ? (
        <img
          src={src}
          alt={role}
          style={{
            width: '100%',
            height: '100%',
            objectFit,
            borderRadius: `${borderRadius}px`,
          }}
          onDoubleClick={() => fileInputRef.current?.click()}
        />
      ) : (
        <div
          style={placeholderStyle}
          onClick={() => fileInputRef.current?.click()}
        >
          {getRoleLabel()}
        </div>
      )}
    </div>
  );
};

// Craft.js node configuration
(ImageNode as any).craft = {
  displayName: 'Image',
  props: defaultProps,
  related: {
    settings: ImageNodeSettings,
  },
};

// Settings panel for ImageNode
function ImageNodeSettings() {
  const {
    actions: { setProp },
    id: nodeId,
    src,
    width,
    height,
    borderRadius,
    opacity,
    objectFit,
    role,
    x,
    y,
    publicUrl,
  } = useNode((node) => ({
    src: node.data.props.src,
    width: node.data.props.width,
    height: node.data.props.height,
    borderRadius: node.data.props.borderRadius,
    opacity: node.data.props.opacity,
    objectFit: node.data.props.objectFit,
    role: node.data.props.role,
    x: node.data.props.x,
    y: node.data.props.y,
    publicUrl: node.data.props.publicUrl,
    id: node.id,
  }));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentTemplate = useDesignerStore((state) => state.currentTemplate);
  const [isUploading, setIsUploading] = useState(false);
  const { logoNodeIds } = useEditor((state) => {
    const ids: string[] = [];
    Object.entries(state.nodes).forEach(([id, node]) => {
      const isImageNode = node.data?.name === 'ImageNode' || node.data?.displayName === 'Image';
      if (isImageNode && node.data?.props?.role === 'logo') {
        ids.push(id);
      }
    });
    return { logoNodeIds: ids };
  });
  const logoInUseByOther = logoNodeIds.some((id) => id !== nodeId);
  const disableLogoOption = logoInUseByOther && role !== 'logo';

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // First, show the image immediately using base64
    const reader = new FileReader();
    reader.onload = () => {
      setProp((props: ImageNodeProps) => (props.src = reader.result as string));
    };
    reader.readAsDataURL(file);

    // Then upload to API to get public URL for OCA
    setIsUploading(true);
    try {
      const assetType = role === 'logo' ? 'logo' : role === 'background' ? 'background' : 'decoration';
      const result = await credentialDesignerApi.uploadFile(
        file,
        assetType,
        currentTemplate?.id
      );

      if (result.success && result.asset) {
        setProp((props: ImageNodeProps) => {
          props.assetId = result.asset.id;
          props.publicUrl = result.asset.public_url;
        });
      }
    } catch (error) {
      console.error('Failed to upload image to server:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Image
        </label>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          accept="image/*"
          className="hidden"
          disabled={isUploading}
        />
        {src ? (
          <div className="relative">
            <img
              src={src}
              alt="Preview"
              className="w-full h-24 object-contain bg-surface-200 rounded border border-border-primary"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity text-white text-sm disabled:cursor-not-allowed"
            >
              {isUploading ? 'Uploading...' : 'Change Image'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full py-8 border-2 border-dashed border-border-secondary rounded bg-surface-200 text-text-secondary hover:border-border-primary hover:text-text-primary transition-colors disabled:cursor-not-allowed"
          >
            {isUploading ? 'Uploading...' : 'Click to upload'}
          </button>
        )}
        {/* Show public URL status for OCA export */}
        {src && (
          <div className={`mt-2 text-xs flex items-center gap-1 ${publicUrl ? 'text-success-500' : 'text-warning-500'}`}>
            <span className={`w-2 h-2 rounded-full ${publicUrl ? 'bg-success-500' : 'bg-warning-500'}`} />
            {publicUrl ? 'Ready for OCA export' : 'Local only (re-upload for OCA)'}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Role (for OCA export)
        </label>
        <select
          value={role}
          onChange={(e) => {
            const nextRole = e.target.value as ImageNodeProps['role'];
            if (nextRole === 'logo' && disableLogoOption) {
              return;
            }
            setProp((props: ImageNodeProps) => (props.role = nextRole));
          }}
          className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
        >
          <option value="logo" disabled={disableLogoOption}>
            Logo (maps to OCA logo)
          </option>
          <option value="background">Background (maps to OCA background_image)</option>
          <option value="decoration">Decoration (not exported)</option>
        </select>
        {disableLogoOption && (
          <p className="mt-1 text-xs text-text-tertiary">
            Another image is already set as the Logo. Deselect it to use this one.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Width
          </label>
          <input
            type="number"
            value={width}
            onChange={(e) => setProp((props: ImageNodeProps) => (props.width = parseInt(e.target.value)))}
            className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
            min="10"
            max="340"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Height
          </label>
          <input
            type="number"
            value={height}
            onChange={(e) => setProp((props: ImageNodeProps) => (props.height = parseInt(e.target.value)))}
            className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
            min="10"
            max="215"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Border Radius: {borderRadius}px
        </label>
        <input
          type="range"
          min="0"
          max="50"
          value={borderRadius}
          onChange={(e) => setProp((props: ImageNodeProps) => (props.borderRadius = parseInt(e.target.value)))}
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Opacity: {Math.round(opacity * 100)}%
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={opacity * 100}
          onChange={(e) => setProp((props: ImageNodeProps) => (props.opacity = parseInt(e.target.value) / 100))}
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Object Fit
        </label>
        <select
          value={objectFit}
          onChange={(e) => setProp((props: ImageNodeProps) => (props.objectFit = e.target.value as ImageNodeProps['objectFit']))}
          className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
        >
          <option value="contain">Contain</option>
          <option value="cover">Cover</option>
          <option value="fill">Fill</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            X Position
          </label>
          <input
            type="number"
            value={x}
            onChange={(e) => setProp((props: ImageNodeProps) => (props.x = parseInt(e.target.value)))}
            className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Y Position
          </label>
          <input
            type="number"
            value={y}
            onChange={(e) => setProp((props: ImageNodeProps) => (props.y = parseInt(e.target.value)))}
            className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
          />
        </div>
      </div>
    </div>
  );
}

export default ImageNode;
