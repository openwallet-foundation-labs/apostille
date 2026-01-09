'use client';

import React, { useRef, useState } from 'react';
import { useNode, Element } from '@craftjs/core';
import { CardContainerProps, SHADOW_PRESETS, DEFAULT_CARD_WIDTH, DEFAULT_CARD_HEIGHT } from '@/lib/credential-designer/types';
import { credentialDesignerApi } from '@/lib/credential-designer/api';
import { useDesignerStore } from '@/lib/credential-designer/store';

const defaultProps: CardContainerProps = {
  backgroundColor: '#1e3a5f',
  backgroundGradient: {
    type: 'linear',
    colors: ['#1e3a5f', '#0f1f33'],
    angle: 135,
  },
  backgroundImage: undefined,
  backgroundImageOpacity: 1,
  backgroundImageFit: 'cover',
  borderRadius: 12,
  padding: 20,
  shadow: 'lg',
};

export const CardContainer: React.FC<Partial<CardContainerProps> & { children?: React.ReactNode }> = ({
  backgroundColor = defaultProps.backgroundColor,
  backgroundGradient = defaultProps.backgroundGradient,
  backgroundImage,
  backgroundImageOpacity = defaultProps.backgroundImageOpacity,
  backgroundImageFit = defaultProps.backgroundImageFit,
  borderRadius = defaultProps.borderRadius,
  padding = defaultProps.padding,
  shadow = defaultProps.shadow,
  children,
}) => {
  const {
    connectors: { connect, drag },
    selected,
  } = useNode((state) => ({
    selected: state.events.selected,
  }));

  // Build background style
  const getBackgroundStyle = (): React.CSSProperties => {
    if (backgroundGradient && backgroundGradient.colors.length > 1) {
      const { type, colors, angle = 135 } = backgroundGradient;
      if (type === 'radial') {
        return {
          background: `radial-gradient(circle, ${colors.join(', ')})`,
        };
      }
      return {
        background: `linear-gradient(${angle}deg, ${colors.join(', ')})`,
      };
    }
    return {
      backgroundColor,
    };
  };

  const style: React.CSSProperties = {
    ...getBackgroundStyle(),
    borderRadius: `${borderRadius}px`,
    padding: `${padding}px`,
    boxShadow: SHADOW_PRESETS[shadow],
    width: `${DEFAULT_CARD_WIDTH}px`,
    height: `${DEFAULT_CARD_HEIGHT}px`,
    position: 'relative',
    overflow: 'hidden',
    outline: selected ? '2px solid #3b82f6' : 'none',
    outlineOffset: '2px',
  };

  return (
    <div
      ref={(ref) => { if (ref) connect(drag(ref)); }}
      style={style}
      className="credential-card-container"
    >
      {/* Background Image Layer */}
      {backgroundImage && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: backgroundImageOpacity,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          <img
            src={backgroundImage}
            alt="Background"
            style={{
              width: '100%',
              height: '100%',
              objectFit: backgroundImageFit,
              borderRadius: `${borderRadius}px`,
            }}
          />
        </div>
      )}
      {/* Content Layer */}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
        {children}
      </div>
    </div>
  );
};

// Craft.js node configuration
(CardContainer as any).craft = {
  displayName: 'Card',
  props: defaultProps,
  isCanvas: true, // CRITICAL: Required to accept dropped children
  rules: {
    canDrag: () => false, // Root container shouldn't be draggable
    canMoveIn: () => true, // Allow all nodes to be dropped
    canMoveOut: () => true,
  },
  related: {
    settings: CardContainerSettings,
  },
};

// Settings panel for CardContainer
function CardContainerSettings() {
  const {
    actions: { setProp },
    backgroundColor,
    backgroundGradient,
    backgroundImage,
    backgroundImageOpacity,
    backgroundImageFit,
    borderRadius,
    padding,
    shadow,
  } = useNode((node) => ({
    backgroundColor: node.data.props.backgroundColor,
    backgroundGradient: node.data.props.backgroundGradient,
    backgroundImage: node.data.props.backgroundImage,
    backgroundImageOpacity: node.data.props.backgroundImageOpacity ?? 1,
    backgroundImageFit: node.data.props.backgroundImageFit ?? 'cover',
    borderRadius: node.data.props.borderRadius,
    padding: node.data.props.padding,
    shadow: node.data.props.shadow,
  }));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const currentTemplate = useDesignerStore((state) => state.currentTemplate);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show image immediately using base64
    const reader = new FileReader();
    reader.onload = () => {
      setProp((props: CardContainerProps) => {
        props.backgroundImage = reader.result as string;
      });
    };
    reader.readAsDataURL(file);

    // Upload to API for public URL
    setIsUploading(true);
    try {
      const result = await credentialDesignerApi.uploadFile(
        file,
        'background',
        currentTemplate?.id
      );
      if (result.success && result.asset?.public_url) {
        setProp((props: CardContainerProps) => {
          props.backgroundImage = result.asset.public_url;
        });
      }
    } catch (error) {
      console.error('Failed to upload background image:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveBackground = () => {
    setProp((props: CardContainerProps) => {
      props.backgroundImage = undefined;
    });
  };

  return (
    <div className="space-y-4">
      {/* Background Image Section */}
      <div className="border-b border-border-primary pb-4">
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Background Image
        </label>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          accept="image/*"
          className="hidden"
          disabled={isUploading}
        />
        {backgroundImage ? (
          <div className="space-y-2">
            <div className="relative">
              <img
                src={backgroundImage}
                alt="Background Preview"
                className="w-full h-20 object-cover rounded border border-border-primary"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity text-white text-xs"
              >
                {isUploading ? 'Uploading...' : 'Change'}
              </button>
            </div>
            <button
              onClick={handleRemoveBackground}
              className="w-full py-1.5 text-xs text-error-500 hover:text-error-400 border border-error-500/30 hover:border-error-500/50 rounded transition-colors"
            >
              Remove Background
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full py-6 border-2 border-dashed border-border-secondary rounded bg-surface-200 text-text-secondary hover:border-border-primary hover:text-text-primary transition-colors text-sm"
          >
            {isUploading ? 'Uploading...' : 'Click to upload background image'}
          </button>
        )}

        {backgroundImage && (
          <>
            <div className="mt-3">
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Image Opacity: {Math.round(backgroundImageOpacity * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={backgroundImageOpacity * 100}
                onChange={(e) =>
                  setProp((props: CardContainerProps) => {
                    props.backgroundImageOpacity = parseInt(e.target.value) / 100;
                  })
                }
                className="w-full"
              />
            </div>

            <div className="mt-3">
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Image Fit
              </label>
              <select
                value={backgroundImageFit}
                onChange={(e) =>
                  setProp((props: CardContainerProps) => {
                    props.backgroundImageFit = e.target.value as 'cover' | 'contain' | 'fill';
                  })
                }
                className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
              >
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
                <option value="fill">Fill</option>
              </select>
            </div>
          </>
        )}
      </div>

      {/* Background Color */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Background Color
        </label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={backgroundColor}
            onChange={(e) => setProp((props: CardContainerProps) => (props.backgroundColor = e.target.value))}
            className="w-10 h-10 rounded cursor-pointer"
          />
          <input
            type="text"
            value={backgroundColor}
            onChange={(e) => setProp((props: CardContainerProps) => (props.backgroundColor = e.target.value))}
            className="flex-1 px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Gradient Second Color
        </label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={backgroundGradient?.colors?.[1] || backgroundColor}
            onChange={(e) =>
              setProp((props: CardContainerProps) => {
                if (!props.backgroundGradient) {
                  props.backgroundGradient = { type: 'linear', colors: [backgroundColor, e.target.value], angle: 135 };
                } else {
                  props.backgroundGradient.colors[1] = e.target.value;
                }
              })
            }
            className="w-10 h-10 rounded cursor-pointer"
          />
          <input
            type="text"
            value={backgroundGradient?.colors?.[1] || ''}
            onChange={(e) =>
              setProp((props: CardContainerProps) => {
                if (!props.backgroundGradient) {
                  props.backgroundGradient = { type: 'linear', colors: [backgroundColor, e.target.value], angle: 135 };
                } else {
                  props.backgroundGradient.colors[1] = e.target.value;
                }
              })
            }
            className="flex-1 px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Gradient Type
        </label>
        <select
          value={backgroundGradient?.type || 'linear'}
          onChange={(e) =>
            setProp((props: CardContainerProps) => {
              if (!props.backgroundGradient) {
                props.backgroundGradient = { type: e.target.value as 'linear' | 'radial', colors: [backgroundColor, '#000000'], angle: 135 };
              } else {
                props.backgroundGradient.type = e.target.value as 'linear' | 'radial';
              }
            })
          }
          className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
        >
          <option value="linear">Linear</option>
          <option value="radial">Radial</option>
        </select>
      </div>

      {backgroundGradient?.type === 'linear' && (
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Gradient Angle: {backgroundGradient?.angle || 135}°
          </label>
          <input
            type="range"
            min="0"
            max="360"
            value={backgroundGradient?.angle || 135}
            onChange={(e) =>
              setProp((props: CardContainerProps) => {
                if (props.backgroundGradient) {
                  props.backgroundGradient.angle = parseInt(e.target.value);
                }
              })
            }
            className="w-full"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Border Radius: {borderRadius}px
        </label>
        <input
          type="range"
          min="0"
          max="32"
          value={borderRadius}
          onChange={(e) => setProp((props: CardContainerProps) => (props.borderRadius = parseInt(e.target.value)))}
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Padding: {padding}px
        </label>
        <input
          type="range"
          min="0"
          max="40"
          value={padding}
          onChange={(e) => setProp((props: CardContainerProps) => (props.padding = parseInt(e.target.value)))}
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Shadow
        </label>
        <select
          value={shadow}
          onChange={(e) => setProp((props: CardContainerProps) => (props.shadow = e.target.value as CardContainerProps['shadow']))}
          className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
        >
          <option value="none">None</option>
          <option value="sm">Small</option>
          <option value="md">Medium</option>
          <option value="lg">Large</option>
          <option value="xl">Extra Large</option>
        </select>
      </div>
    </div>
  );
}

export default CardContainer;
