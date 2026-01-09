'use client';

import React, { useState, useEffect } from 'react';
import {
  MDL_DOCTYPE,
  MID_DOCTYPE,
  MDL_NAMESPACE,
  MID_NAMESPACE,
  MDL_STANDARD_ATTRIBUTES,
  MID_STANDARD_ATTRIBUTES,
  type MdocNamespace,
  type MdocNamespaceData,
  type MdocAttributeDefinition,
} from '@/lib/api';

interface MdlNamespaceConfigProps {
  doctype: string;
  selectedAttributes: string[];
  onAttributesChange: (attributes: string[]) => void;
  onNamespacesChange?: (namespaces: MdocNamespaceData) => void;
  allowCustomAttributes?: boolean;
}

const DOCTYPE_OPTIONS = [
  { value: MDL_DOCTYPE, label: "Mobile Driver's License (mDL)", namespace: MDL_NAMESPACE },
  { value: MID_DOCTYPE, label: 'Mobile ID (mID)', namespace: MID_NAMESPACE },
  { value: 'custom', label: 'Custom Document Type', namespace: '' },
];

export default function MdlNamespaceConfig({
  doctype,
  selectedAttributes,
  onAttributesChange,
  onNamespacesChange,
  allowCustomAttributes = true,
}: MdlNamespaceConfigProps) {
  const [customAttributes, setCustomAttributes] = useState<
    Array<{ name: string; type: string; required: boolean }>
  >([]);
  const [newAttributeName, setNewAttributeName] = useState('');
  const [newAttributeType, setNewAttributeType] = useState('tstr');

  // Get the appropriate attributes for the selected doctype
  const getAttributesForDoctype = (): MdocNamespace => {
    if (doctype === MDL_DOCTYPE) {
      return MDL_STANDARD_ATTRIBUTES;
    } else if (doctype === MID_DOCTYPE) {
      return MID_STANDARD_ATTRIBUTES;
    }
    return {};
  };

  const getNamespaceForDoctype = (): string => {
    const option = DOCTYPE_OPTIONS.find((opt) => opt.value === doctype);
    return option?.namespace || '';
  };

  const standardAttributes = getAttributesForDoctype();
  const namespace = getNamespaceForDoctype();

  // Toggle attribute selection
  const toggleAttribute = (attrName: string) => {
    const attr = standardAttributes[attrName];
    if (attr?.required) return; // Cannot unselect required attributes

    const newSelected = selectedAttributes.includes(attrName)
      ? selectedAttributes.filter((a) => a !== attrName)
      : [...selectedAttributes, attrName];

    onAttributesChange(newSelected);
    updateNamespaces(newSelected);
  };

  // Select all attributes
  const selectAll = () => {
    const allAttrs = Object.keys(standardAttributes);
    onAttributesChange(allAttrs);
    updateNamespaces(allAttrs);
  };

  // Select only required attributes
  const selectRequired = () => {
    const requiredAttrs = Object.entries(standardAttributes)
      .filter(([_, def]) => def.required)
      .map(([name]) => name);
    onAttributesChange(requiredAttrs);
    updateNamespaces(requiredAttrs);
  };

  // Update namespaces object based on selected attributes
  const updateNamespaces = (selected: string[]) => {
    if (!onNamespacesChange || !namespace) return;

    const namespaceAttrs: MdocNamespace = {};
    for (const attrName of selected) {
      if (standardAttributes[attrName]) {
        namespaceAttrs[attrName] = standardAttributes[attrName];
      }
    }

    // Add custom attributes
    for (const custom of customAttributes) {
      namespaceAttrs[custom.name] = {
        type: custom.type as any,
        required: custom.required,
        display: custom.name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      };
    }

    onNamespacesChange({ [namespace]: namespaceAttrs });
  };

  // Add custom attribute
  const addCustomAttribute = () => {
    if (!newAttributeName.trim()) return;

    const attrKey = newAttributeName.toLowerCase().replace(/\s+/g, '_');
    if (standardAttributes[attrKey] || customAttributes.find((a) => a.name === attrKey)) {
      return; // Already exists
    }

    const newCustomAttrs = [
      ...customAttributes,
      { name: attrKey, type: newAttributeType, required: false },
    ];
    setCustomAttributes(newCustomAttrs);

    const newSelected = [...selectedAttributes, attrKey];
    onAttributesChange(newSelected);
    setNewAttributeName('');

    // Update namespaces with custom attribute
    setTimeout(() => updateNamespaces(newSelected), 0);
  };

  // Remove custom attribute
  const removeCustomAttribute = (name: string) => {
    setCustomAttributes(customAttributes.filter((a) => a.name !== name));
    onAttributesChange(selectedAttributes.filter((a) => a !== name));
  };

  // Initialize with required attributes
  useEffect(() => {
    const requiredAttrs = Object.entries(standardAttributes)
      .filter(([_, def]) => def.required)
      .map(([name]) => name);

    // Only auto-select if no attributes are selected yet
    if (selectedAttributes.length === 0 && requiredAttrs.length > 0) {
      onAttributesChange(requiredAttrs);
      updateNamespaces(requiredAttrs);
    }
  }, [doctype]);

  const attributeTypeLabels: Record<string, string> = {
    tstr: 'Text',
    bstr: 'Binary (Image)',
    uint: 'Unsigned Integer',
    int: 'Integer',
    bool: 'Boolean',
    'full-date': 'Date',
    array: 'Array',
  };

  return (
    <div className="space-y-4">
      {/* Attribute Selection Actions */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-text-primary">Select Attributes</h4>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectRequired}
            className="text-xs px-2 py-1 rounded bg-surface-100 hover:bg-surface-200 text-text-secondary"
          >
            Required Only
          </button>
          <button
            type="button"
            onClick={selectAll}
            className="text-xs px-2 py-1 rounded bg-surface-100 hover:bg-surface-200 text-text-secondary"
          >
            Select All
          </button>
        </div>
      </div>

      {/* Standard Attributes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto p-2 bg-surface-100 rounded-lg">
        {Object.entries(standardAttributes).map(([attrName, attrDef]) => {
          const isSelected = selectedAttributes.includes(attrName);
          const isRequired = attrDef.required;

          return (
            <label
              key={attrName}
              className={`
                flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors
                ${isSelected ? 'bg-primary-50 border border-primary-200' : 'bg-surface-50 border border-transparent hover:bg-surface-200'}
                ${isRequired ? 'cursor-default' : ''}
              `}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleAttribute(attrName)}
                disabled={isRequired}
                className="mt-1 h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">
                    {attrDef.display || attrName}
                  </span>
                  {isRequired && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-error/10 text-error">Required</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-text-tertiary font-mono">{attrName}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-surface-200 text-text-secondary">
                    {attributeTypeLabels[attrDef.type] || attrDef.type}
                  </span>
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {/* Custom Attributes Section */}
      {allowCustomAttributes && (
        <div className="space-y-3 pt-3 border-t border-border">
          <h4 className="text-sm font-medium text-text-primary">Custom Attributes</h4>

          {/* Custom attribute list */}
          {customAttributes.length > 0 && (
            <div className="space-y-2">
              {customAttributes.map((attr) => (
                <div
                  key={attr.name}
                  className="flex items-center justify-between p-2 bg-surface-100 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-primary">{attr.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-surface-200 text-text-secondary">
                      {attributeTypeLabels[attr.type] || attr.type}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCustomAttribute(attr.name)}
                    className="p-1 text-text-tertiary hover:text-error"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add custom attribute form */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newAttributeName}
              onChange={(e) => setNewAttributeName(e.target.value)}
              placeholder="Attribute name"
              className="input flex-1"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomAttribute())}
            />
            <select
              value={newAttributeType}
              onChange={(e) => setNewAttributeType(e.target.value)}
              className="input w-32"
            >
              <option value="tstr">Text</option>
              <option value="uint">Number</option>
              <option value="bool">Boolean</option>
              <option value="full-date">Date</option>
              <option value="bstr">Binary</option>
            </select>
            <button
              type="button"
              onClick={addCustomAttribute}
              disabled={!newAttributeName.trim()}
              className="btn btn-secondary"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Selection Summary */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <span className="text-sm text-text-secondary">
          {selectedAttributes.length} attributes selected
        </span>
        {namespace && (
          <span className="text-xs text-text-tertiary font-mono">
            Namespace: {namespace}
          </span>
        )}
      </div>
    </div>
  );
}
