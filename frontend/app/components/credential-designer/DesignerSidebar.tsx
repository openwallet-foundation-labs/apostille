'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useEditor } from '@craftjs/core';
import { useDesignerStore } from '@/lib/credential-designer/store';
import { credentialDesignerApi } from '@/lib/credential-designer/api';
import { TextNode, ImageNode, AttributeNode } from './nodes';
import { PresetTemplate } from '@/lib/credential-designer/types';

export default function DesignerSidebar() {
  const { connectors } = useEditor();

  // Use individual selectors to prevent unnecessary re-renders
  const sidebarTab = useDesignerStore((state) => state.sidebarTab);
  const setSidebarTab = useDesignerStore((state) => state.setSidebarTab);
  const uploadedAssets = useDesignerStore((state) => state.uploadedAssets);
  const loadAssets = useDesignerStore((state) => state.loadAssets);
  const createFromPreset = useDesignerStore((state) => state.createFromPreset);
  const availableAttributes = useDesignerStore((state) => state.availableAttributes);

  const [presets, setPresets] = useState<PresetTemplate[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(false);
  // Refs for drag sources - these persist across renders
  const dragSourceRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const componentsRef = useRef<HTMLDivElement>(null);
  const attributesContainerRef = useRef<HTMLDivElement>(null);

  // Load assets on mount
  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  // Register a drag source and store ref
  const registerDragSource = useCallback((key: string, element: React.ReactElement) => {
    return (ref: HTMLDivElement | null) => {
      if (ref) {
        dragSourceRefs.current.set(key, ref);
        connectors.create(ref, element);
      } else {
        dragSourceRefs.current.delete(key);
      }
    };
  }, [connectors]);

  // Load presets when tab changes
  useEffect(() => {
    if (sidebarTab === 'templates' && presets.length === 0) {
      setLoadingPresets(true);
      credentialDesignerApi.getPresets()
        .then((result) => setPresets(result.presets))
        .catch(console.error)
        .finally(() => setLoadingPresets(false));
    }
  }, [sidebarTab, presets.length]);

  const components = [
    {
      name: 'Text',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
        </svg>
      ),
      element: <TextNode text="New Text" x={20} y={20} />,
    },
    {
      name: 'Image',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      element: <ImageNode role="decoration" x={20} y={20} />,
    },
    {
      name: 'Logo',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      ),
      element: <ImageNode role="logo" x={20} y={20} width={60} height={60} />,
    },
  ];

  const renderComponentsTab = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
          Elements
        </h3>
        <div ref={componentsRef} className="grid grid-cols-2 gap-2">
          {components.map((comp) => (
            <div
              key={comp.name}
              ref={registerDragSource(`component-${comp.name}`, comp.element)}
              className="p-3 bg-surface-200 border border-border-primary rounded-lg cursor-grab hover:border-border-secondary hover:bg-surface-300 transition-colors flex flex-col items-center gap-2 select-none"
              draggable={false}
            >
              <div className="text-text-secondary">{comp.icon}</div>
              <span className="text-xs text-text-primary">{comp.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Credential Attributes Section */}
      <div className="border-t border-border-primary pt-4">
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
          Credential Attributes
        </h3>

        {/* Attributes List - Each attribute is draggable */}
        {availableAttributes.length === 0 ? (
          <div className="text-center py-4 text-text-tertiary text-xs">
            <p>No schema attributes available.</p>
            <p className="mt-1">Add attributes in Create New Schema to place them on the card.</p>
          </div>
        ) : (
          <div ref={attributesContainerRef} className="space-y-1.5 max-h-64 overflow-y-auto">
            {[...new Set(availableAttributes)].map((attr, index) => (
              <DraggableAttribute
                key={attr}
                attr={attr}
                index={index}
                connectors={connectors}
              />
            ))}
          </div>
        )}

        {/* Hint */}
        <p className="mt-2 text-xs text-text-tertiary">
          Drag attributes onto the card. Each attribute can be placed multiple times.
        </p>
      </div>
    </div>
  );

  const renderTemplatesTab = () => (
    <div className="space-y-4">
      {loadingPresets ? (
        <div className="text-center py-8 text-text-tertiary">Loading templates...</div>
      ) : (
        <>
          {/* Group presets by category */}
          {['education', 'professional', 'membership'].map((category) => {
            const categoryPresets = presets.filter((p) => p.category === category);
            if (categoryPresets.length === 0) return null;

            return (
              <div key={category}>
                <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                  {category}
                </h3>
                <div className="space-y-2">
                  {categoryPresets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => createFromPreset(preset.craft_state, preset.name, preset.category)}
                      className="w-full p-3 bg-surface-200 border border-border-primary rounded-lg hover:border-border-secondary hover:bg-surface-300 transition-colors text-left"
                    >
                      <div className="font-medium text-sm text-text-primary">{preset.name}</div>
                      <div className="text-xs text-text-secondary mt-1">{preset.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );

  const renderAssetsTab = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
          Uploaded Assets
        </h3>
        {uploadedAssets.length === 0 ? (
          <div className="text-center py-8 text-text-tertiary text-sm">
            No assets uploaded yet
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {uploadedAssets.map((asset) => (
              <div
                key={asset.id}
                ref={registerDragSource(`asset-${asset.id}`, <ImageNode src={asset.content} role={asset.asset_type as 'logo' | 'background' | 'decoration'} x={20} y={20} />)}
                className="aspect-square bg-surface-200 border border-border-primary rounded overflow-hidden cursor-grab hover:border-border-secondary transition-colors select-none"
                draggable={false}
              >
                <img
                  src={asset.content}
                  alt={asset.file_name}
                  className="w-full h-full object-contain"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="w-64 bg-surface-100 border-r border-border-primary flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-border-primary">
        {[
          { id: 'components', label: 'Components' },
          { id: 'templates', label: 'Templates' },
          { id: 'assets', label: 'Assets' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSidebarTab(tab.id as typeof sidebarTab)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              sidebarTab === tab.id
                ? 'text-text-primary border-b-2 border-primary-500'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {sidebarTab === 'components' && renderComponentsTab()}
        {sidebarTab === 'templates' && renderTemplatesTab()}
        {sidebarTab === 'assets' && renderAssetsTab()}
      </div>
    </div>
  );
}

// Separate component for draggable attributes to isolate re-renders
function DraggableAttribute({
  attr,
  index,
  connectors,
}: {
  attr: string;
  index: number;
  connectors: any;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const registeredRef = useRef(false);

  // Register drag source once when mounted
  useEffect(() => {
    if (elementRef.current && !registeredRef.current) {
      const element = <AttributeNode attributeName={attr} role="regular" fontSize={14} x={20} y={20 + (index * 25)} />;
      connectors.create(elementRef.current, element);
      registeredRef.current = true;
    }
  }, [attr, index, connectors]);

  // Re-register if connectors change
  useEffect(() => {
    registeredRef.current = false;
  }, [connectors]);

  return (
    <div
      ref={elementRef}
      className="group flex items-center justify-between p-2 bg-surface-200 border border-border-primary rounded cursor-grab hover:border-primary-500 hover:bg-surface-300 transition-colors select-none"
      draggable={false}
    >
      <div className="flex items-center gap-2">
        <svg className="w-3.5 h-3.5 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        <span className="text-sm text-text-primary">{attr}</span>
      </div>
    </div>
  );
}
