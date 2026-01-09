'use client';

import React, { useEffect, useCallback, useState, useRef } from 'react';
import { Editor, Frame, Element, useEditor } from '@craftjs/core';
import { useDesignerStore } from '@/lib/credential-designer/store';
import { CardContainer, TextNode, ImageNode, AttributeNode } from './nodes';
import DesignerToolbar from './DesignerToolbar';
import DesignerSidebar from './DesignerSidebar';
import DesignerProperties from './DesignerProperties';
import { CraftState, DEFAULT_CARD_WIDTH, DEFAULT_CARD_HEIGHT } from '@/lib/credential-designer/types';
import { DesignerProvider } from './context/DesignerContext';

// Keyboard handler component - must be inside Editor context
function KeyboardHandler() {
  const { actions, selected } = useEditor((state) => {
    const selectedIds = Array.from(state.events.selected);
    return {
      selected: selectedIds.length > 0 ? selectedIds[0] : null,
    };
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete or Backspace to remove selected element
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && selected !== 'ROOT') {
        // Don't delete if user is typing in an input
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        actions.delete(selected);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions, selected]);

  return null;
}

interface CredentialDesignerProps {
  templateId?: string;
  schemaAttributes?: string[];
  schemaId?: string;
  onSave?: (templateId: string) => void;
  onExport?: (overlay: any) => void;
}

// Stable default for schemaAttributes to avoid re-render loops
const EMPTY_ATTRIBUTES: string[] = [];

export default function CredentialDesigner({
  templateId,
  schemaAttributes,
  schemaId,
  onSave,
  onExport,
}: CredentialDesignerProps) {
  const {
    currentTemplate,
    isLoading,
    error,
    zoom,
    showGrid,
    previewMode,
    loadTemplate,
    createNewTemplate,
    setAvailableAttributes,
    setSchemaId,
    updateCraftState,
  } = useDesignerStore();

  // Use stable reference for empty attributes
  const stableSchemaAttributes = schemaAttributes ?? EMPTY_ATTRIBUTES;

  // Track if we're initializing (loading template or creating new)
  const [isInitializing, setIsInitializing] = useState(!!templateId);

  // Track if editor has been initialized to prevent feedback loops
  const editorInitializedRef = useRef(false);

  // Store initial craft state - only set once per template load to prevent feedback loops
  const [initialCraftState, setInitialCraftState] = useState<string | undefined>(undefined);

  // Load template or create new
  useEffect(() => {
    const initialize = async () => {
      editorInitializedRef.current = false;
      setInitialCraftState(undefined);
      if (templateId) {
        setIsInitializing(true);
        await loadTemplate(templateId);
        setIsInitializing(false);
      } else if (!currentTemplate) {
        createNewTemplate('New Template');
        setIsInitializing(false);
      } else {
        setIsInitializing(false);
      }
    };
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]); // Only depend on templateId to avoid loops

  // Set initial craft state only once when template loads
  useEffect(() => {
    if (currentTemplate && !editorInitializedRef.current) {
      const serialized = currentTemplate.craft_state
        ? JSON.stringify(currentTemplate.craft_state)
        : undefined;
      console.log('[CredentialDesigner] Setting initial craft state:', {
        templateId: currentTemplate.id,
        hasExistingState: !!currentTemplate.craft_state,
        serializedLength: serialized?.length,
      });
      setInitialCraftState(serialized);
      editorInitializedRef.current = true;
    }
  }, [currentTemplate]);

  // Set schema context - only run once on mount or when props actually change
  useEffect(() => {
    setAvailableAttributes(stableSchemaAttributes);
    setSchemaId(schemaId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaId]); // Only re-run if schemaId changes, not on every render

  // Keyboard delete support will be handled by a separate component inside Editor

  // Debounce ref for state changes
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Track last serialized state to prevent unnecessary updates
  const lastSerializedRef = useRef<string | null>(null);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Handle Craft.js state changes - debounced to prevent UI freeze
  const handleStateChange = useCallback((query: any) => {
    if (!editorInitializedRef.current) return;

    // Clear any pending update
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce the state update to prevent overwhelming the main thread
    debounceRef.current = setTimeout(() => {
      try {
        const nodes = query.getSerializedNodes();
        const serialized = JSON.stringify(nodes);

        // Skip if state hasn't actually changed (prevents infinite loops)
        if (serialized === lastSerializedRef.current) return;

        lastSerializedRef.current = serialized;
        updateCraftState(nodes as CraftState);
      } catch (e) {
        console.error('[CredentialDesigner] Error in state change:', e);
      }
    }, 150); // 150ms debounce
  }, [updateCraftState]);

  // Show loading state while initializing or loading
  if (isLoading || isInitializing || !currentTemplate) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface-100">
        <div className="text-text-secondary">Loading designer...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface-100">
        <div className="text-error-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-surface-100 text-text-primary">
      <Editor
        key={currentTemplate.id || 'new'} // Force re-mount when template changes
        resolver={{
          CardContainer,
          TextNode,
          ImageNode,
          AttributeNode,
        }}
        onNodesChange={handleStateChange}
      >
        {/* Keyboard handler for delete */}
        <KeyboardHandler />

        {/* Toolbar */}
        <DesignerToolbar onSave={onSave} onExport={onExport} />

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          {!previewMode && <DesignerSidebar />}

          {/* Canvas area */}
          <div className="flex-1 flex items-center justify-center bg-surface-200 overflow-auto p-8">
            <DesignerProvider zoom={zoom}>
              <div
                className="relative"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'center center',
                }}
              >
                {/* Grid background */}
                {showGrid && !previewMode && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      width: `${DEFAULT_CARD_WIDTH}px`,
                      height: `${DEFAULT_CARD_HEIGHT}px`,
                      backgroundImage: `
                        linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
                      `,
                      backgroundSize: '20px 20px',
                    }}
                  />
                )}

                {/* Card frame - use initialCraftState to prevent feedback loops */}
                <Frame data={initialCraftState}>
                  <Element
                    is={CardContainer}
                    canvas
                    custom={{ displayName: 'Card' }}
                  >
                    {/* Default content for new templates */}
                  </Element>
                </Frame>
              </div>
            </DesignerProvider>
          </div>

          {/* Properties panel */}
          {!previewMode && <DesignerProperties />}
        </div>
      </Editor>
    </div>
  );
}
