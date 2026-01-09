'use client';

import React, { useCallback } from 'react';
import { useNode } from '@craftjs/core';
import { AttributeNodeProps, FONT_WEIGHT_OPTIONS } from '@/lib/credential-designer/types';
import { useDesignerStore } from '@/lib/credential-designer/store';
import { useDragMove } from '../hooks/useDragMove';
import { useDesignerContext } from '../context/DesignerContext';

const defaultProps: AttributeNodeProps = {
  attributeName: 'name',
  displayLabel: '',
  fontSize: 16,
  fontWeight: 'normal',
  color: '#ffffff',
  role: 'regular',
  showLabel: false,
  labelPosition: 'above',
  x: 0,
  y: 0,
  textAlign: 'left',
};

export const AttributeNode: React.FC<Partial<AttributeNodeProps>> = (props) => {
  const mergedProps = { ...defaultProps, ...props };
  const {
    attributeName,
    displayLabel,
    fontSize,
    fontWeight,
    color,
    role,
    showLabel,
    labelPosition,
    x,
    y,
    textAlign,
  } = mergedProps;

  const {
    connectors: { connect, drag },
    selected,
    actions: { setProp },
  } = useNode((state) => ({
    selected: state.events.selected,
  }));

  const { zoom, cardBounds } = useDesignerContext();

  // Stable callback for position updates
  const handleMove = useCallback(
    (newX: number, newY: number) => {
      setProp((props: AttributeNodeProps) => {
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
  });

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${displayX}px`,
    top: `${displayY}px`,
    fontSize: `${fontSize}px`,
    fontWeight: fontWeight === 'medium' ? 500 : fontWeight === 'semibold' ? 600 : fontWeight,
    color,
    textAlign,
    cursor: isDragging ? 'grabbing' : 'move',
    outline: selected ? '2px solid #3b82f6' : 'none',
    outlineOffset: '2px',
    padding: '2px',
    minWidth: '40px',
    opacity: isDragging ? 0.8 : 1,
    transition: isDragging ? 'none' : 'opacity 0.15s ease',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: `${fontSize * 0.75}px`,
    opacity: 0.7,
    marginBottom: labelPosition === 'above' ? '2px' : 0,
    marginTop: labelPosition === 'below' ? '2px' : 0,
  };

  const getRoleBadgeColor = () => {
    switch (role) {
      case 'primary':
        return 'bg-blue-500';
      case 'secondary':
        return 'bg-purple-500';
      default:
        return 'bg-surface-500';
    }
  };

  const renderLabel = () => {
    if (!showLabel) return null;
    return (
      <div style={labelStyle}>
        {displayLabel || attributeName}
      </div>
    );
  };

  return (
    <div
      ref={(ref) => { if (ref) connect(drag(ref)); }}
      style={style}
      className="attribute-node"
      onMouseDown={onMouseDown}
    >
      {showLabel && labelPosition === 'above' && renderLabel()}
      <div className="flex items-center gap-1">
        {showLabel && labelPosition === 'inline' && (
          <span style={labelStyle}>{displayLabel || attributeName}:</span>
        )}
        <span className="flex items-center gap-1">
          {`{{${attributeName}}}`}
          {role !== 'regular' && (
            <span className={`text-[8px] px-1 rounded ${getRoleBadgeColor()} text-white`}>
              {role === 'primary' ? '1' : '2'}
            </span>
          )}
        </span>
      </div>
      {showLabel && labelPosition === 'below' && renderLabel()}
    </div>
  );
};

// Craft.js node configuration
(AttributeNode as any).craft = {
  displayName: 'Attribute',
  props: defaultProps,
  related: {
    settings: AttributeNodeSettings,
  },
};

// Settings panel for AttributeNode
function AttributeNodeSettings() {
  const availableAttributes = useDesignerStore((s) => s.availableAttributes);

  const {
    actions: { setProp },
    attributeName,
    displayLabel,
    fontSize,
    fontWeight,
    color,
    role,
    showLabel,
    labelPosition,
    x,
    y,
    textAlign,
  } = useNode((node) => ({
    attributeName: node.data.props.attributeName,
    displayLabel: node.data.props.displayLabel,
    fontSize: node.data.props.fontSize,
    fontWeight: node.data.props.fontWeight,
    color: node.data.props.color,
    role: node.data.props.role,
    showLabel: node.data.props.showLabel,
    labelPosition: node.data.props.labelPosition,
    x: node.data.props.x,
    y: node.data.props.y,
    textAlign: node.data.props.textAlign,
  }));

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Attribute Name
        </label>
        {availableAttributes.length > 0 ? (
          <select
            value={attributeName}
            onChange={(e) => setProp((props: AttributeNodeProps) => (props.attributeName = e.target.value))}
            className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
          >
            {availableAttributes.map((attr) => (
              <option key={attr} value={attr}>
                {attr}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={attributeName}
            onChange={(e) => setProp((props: AttributeNodeProps) => (props.attributeName = e.target.value))}
            placeholder="e.g., name, degree, studentId"
            className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
          />
        )}
        <p className="mt-1 text-xs text-text-tertiary">
          This will show as {'{{' + attributeName + '}}'} and be replaced with actual credential data
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Role (for OCA export)
        </label>
        <select
          value={role}
          onChange={(e) => setProp((props: AttributeNodeProps) => (props.role = e.target.value as AttributeNodeProps['role']))}
          className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
        >
          <option value="regular">Regular</option>
          <option value="primary">Primary (maps to OCA primary_attribute)</option>
          <option value="secondary">Secondary (maps to OCA secondary_attribute)</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Font Size
          </label>
          <input
            type="number"
            value={fontSize}
            onChange={(e) => setProp((props: AttributeNodeProps) => (props.fontSize = parseInt(e.target.value)))}
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
            onChange={(e) => setProp((props: AttributeNodeProps) => (props.fontWeight = e.target.value as AttributeNodeProps['fontWeight']))}
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
          Color
        </label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setProp((props: AttributeNodeProps) => (props.color = e.target.value))}
            className="w-10 h-10 rounded cursor-pointer"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setProp((props: AttributeNodeProps) => (props.color = e.target.value))}
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
              onClick={() => setProp((props: AttributeNodeProps) => (props.textAlign = align as AttributeNodeProps['textAlign']))}
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

      <div className="border-t border-border-primary pt-4">
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={showLabel}
            onChange={(e) => setProp((props: AttributeNodeProps) => (props.showLabel = e.target.checked))}
            className="rounded bg-surface-200 border-border-primary text-primary-600"
          />
          Show Label
        </label>

        {showLabel && (
          <>
            <div className="mt-3">
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Label Text
              </label>
              <input
                type="text"
                value={displayLabel}
                onChange={(e) => setProp((props: AttributeNodeProps) => (props.displayLabel = e.target.value))}
                placeholder={attributeName}
                className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
              />
            </div>

            <div className="mt-3">
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Label Position
              </label>
              <select
                value={labelPosition}
                onChange={(e) => setProp((props: AttributeNodeProps) => (props.labelPosition = e.target.value as AttributeNodeProps['labelPosition']))}
                className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
              >
                <option value="above">Above</option>
                <option value="inline">Inline</option>
                <option value="below">Below</option>
              </select>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            X Position
          </label>
          <input
            type="number"
            value={x}
            onChange={(e) => setProp((props: AttributeNodeProps) => (props.x = parseInt(e.target.value)))}
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
            onChange={(e) => setProp((props: AttributeNodeProps) => (props.y = parseInt(e.target.value)))}
            className="w-full px-3 py-2 bg-surface-200 border border-border-primary rounded text-text-primary text-sm"
          />
        </div>
      </div>
    </div>
  );
}

export default AttributeNode;
