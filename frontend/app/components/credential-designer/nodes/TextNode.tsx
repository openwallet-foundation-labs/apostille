'use client';

import React, { useState, useCallback } from 'react';
import { useNode } from '@craftjs/core';
import { TextNodeProps, FONT_OPTIONS, FONT_WEIGHT_OPTIONS, OCAMeta } from '@/lib/credential-designer/types';
import { useDragMove } from '../hooks/useDragMove';
import { useDesignerContext } from '../context/DesignerContext';

const defaultProps: TextNodeProps = {
  text: 'Text',
  fontSize: 16,
  fontWeight: 'normal',
  fontFamily: 'Inter',
  color: '#ffffff',
  textAlign: 'left',
  letterSpacing: 0,
  lineHeight: 1.4,
  textTransform: 'none',
  x: 0,
  y: 0,
  width: undefined,
  isMetaField: false,
  metaKey: undefined,
};

export const TextNode: React.FC<Partial<TextNodeProps>> = (props) => {
  const mergedProps = { ...defaultProps, ...props };
  const {
    text,
    fontSize,
    fontWeight,
    fontFamily,
    color,
    textAlign,
    letterSpacing,
    lineHeight,
    textTransform,
    x,
    y,
    width,
    isMetaField,
  } = mergedProps;

  const {
    connectors: { connect, drag },
    selected,
    actions: { setProp },
  } = useNode((state) => ({
    selected: state.events.selected,
  }));

  const [isEditing, setIsEditing] = useState(false);
  const { zoom, cardBounds } = useDesignerContext();

  // Stable callback for position updates
  const handleMove = useCallback(
    (newX: number, newY: number) => {
      setProp((props: TextNodeProps) => {
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
    enabled: selected && !isEditing,
    zoom,
    bounds: cardBounds,
  });

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${displayX}px`,
    top: `${displayY}px`,
    width: width ? `${width}px` : 'auto',
    fontSize: `${fontSize}px`,
    fontWeight: fontWeight === 'medium' ? 500 : fontWeight === 'semibold' ? 600 : fontWeight,
    fontFamily,
    color,
    textAlign,
    letterSpacing: `${letterSpacing}px`,
    lineHeight,
    textTransform,
    cursor: isDragging ? 'grabbing' : 'move',
    outline: selected ? '2px solid #3b82f6' : 'none',
    outlineOffset: '2px',
    padding: '2px',
    minWidth: '20px',
    whiteSpace: 'nowrap',
    opacity: isDragging ? 0.8 : 1,
    transition: isDragging ? 'none' : 'opacity 0.15s ease',
  };

  const handleDoubleClick = () => {
    setIsEditing(true);
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    setIsEditing(false);
    setProp((props: TextNodeProps) => (props.text = e.target.innerText || 'Text'));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLDivElement).blur();
    }
  };

  return (
    <div
      ref={(ref) => { if (ref) connect(drag(ref)); }}
      style={style}
      className={`text-node ${isMetaField ? 'meta-field' : ''}`}
      contentEditable={isEditing}
      suppressContentEditableWarning
      onDoubleClick={handleDoubleClick}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onMouseDown={onMouseDown}
    >
      {text}
    </div>
  );
};

// Craft.js node configuration
(TextNode as any).craft = {
  displayName: 'Text',
  props: defaultProps,
  related: {
    settings: TextNodeSettings,
  },
};

// Settings panel for TextNode
function TextNodeSettings() {
  const {
    actions: { setProp },
    text,
    fontSize,
    fontWeight,
    fontFamily,
    color,
    textAlign,
    letterSpacing,
    lineHeight,
    textTransform,
    x,
    y,
    width,
    isMetaField,
    metaKey,
  } = useNode((node) => ({
    text: node.data.props.text,
    fontSize: node.data.props.fontSize,
    fontWeight: node.data.props.fontWeight,
    fontFamily: node.data.props.fontFamily,
    color: node.data.props.color,
    textAlign: node.data.props.textAlign,
    letterSpacing: node.data.props.letterSpacing,
    lineHeight: node.data.props.lineHeight,
    textTransform: node.data.props.textTransform,
    x: node.data.props.x,
    y: node.data.props.y,
    width: node.data.props.width,
    isMetaField: node.data.props.isMetaField,
    metaKey: node.data.props.metaKey,
  }));

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Text Content
        </label>
        <input
          type="text"
          value={text}
          onChange={(e) => setProp((props: TextNodeProps) => (props.text = e.target.value))}
          className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Font Size
          </label>
          <input
            type="number"
            value={fontSize}
            onChange={(e) => setProp((props: TextNodeProps) => (props.fontSize = parseInt(e.target.value)))}
            className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
            min="8"
            max="72"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Font Weight
          </label>
          <select
            value={fontWeight}
            onChange={(e) => setProp((props: TextNodeProps) => (props.fontWeight = e.target.value as TextNodeProps['fontWeight']))}
            className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
          >
            {FONT_WEIGHT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Font Family
        </label>
        <select
          value={fontFamily}
          onChange={(e) => setProp((props: TextNodeProps) => (props.fontFamily = e.target.value))}
          className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
        >
          {FONT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Color
        </label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setProp((props: TextNodeProps) => (props.color = e.target.value))}
            className="w-10 h-10 rounded cursor-pointer"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setProp((props: TextNodeProps) => (props.color = e.target.value))}
            className="flex-1 px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Text Align
        </label>
        <div className="flex gap-2">
          {['left', 'center', 'right'].map((align) => (
            <button
              key={align}
              onClick={() => setProp((props: TextNodeProps) => (props.textAlign = align as TextNodeProps['textAlign']))}
              className={`flex-1 px-3 py-2 rounded text-sm ${
                textAlign === align
                  ? 'bg-primary-600 text-white'
                  : 'bg-surface-200 text-text-secondary border border-border-primary'
              }`}
            >
              {align.charAt(0).toUpperCase() + align.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Text Transform
        </label>
        <select
          value={textTransform}
          onChange={(e) => setProp((props: TextNodeProps) => (props.textTransform = e.target.value as TextNodeProps['textTransform']))}
          className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
        >
          <option value="none">None</option>
          <option value="uppercase">UPPERCASE</option>
          <option value="lowercase">lowercase</option>
          <option value="capitalize">Capitalize</option>
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
            onChange={(e) => setProp((props: TextNodeProps) => (props.x = parseInt(e.target.value)))}
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
            onChange={(e) => setProp((props: TextNodeProps) => (props.y = parseInt(e.target.value)))}
            className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
          />
        </div>
      </div>

      <div className="border-t border-border-primary pt-4 mt-4">
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={isMetaField}
            onChange={(e) => setProp((props: TextNodeProps) => (props.isMetaField = e.target.checked))}
            className="rounded bg-surface-200 border-border-primary text-primary-600"
          />
          Map to OCA Meta Field
        </label>

        {isMetaField && (
          <div className="mt-3">
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Meta Field
            </label>
            <select
              value={metaKey || ''}
              onChange={(e) => setProp((props: TextNodeProps) => (props.metaKey = e.target.value as keyof OCAMeta))}
              className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
            >
              <option value="">Select field...</option>
              <option value="name">Credential Name</option>
              <option value="description">Description</option>
              <option value="issuer">Issuer Name</option>
              <option value="issuer_url">Issuer URL</option>
              <option value="issuer_description">Issuer Description</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

export default TextNode;
