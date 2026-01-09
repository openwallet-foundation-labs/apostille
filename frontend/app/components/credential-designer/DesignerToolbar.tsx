'use client';

import React, { useState } from 'react';
import { useEditor } from '@craftjs/core';
import { toPng } from 'html-to-image';
import { useDesignerStore } from '@/lib/credential-designer/store';
import { exportCraftStateToOCA } from '@/lib/credential-designer/ocaExporter';

interface DesignerToolbarProps {
  onSave?: (templateId: string) => void;
  onExport?: (overlay: any) => void;
}

export default function DesignerToolbar({ onSave, onExport }: DesignerToolbarProps) {
  const { actions, query, canUndo, canRedo } = useEditor((state, query) => ({
    canUndo: query.history.canUndo(),
    canRedo: query.history.canRedo(),
  }));

  const {
    currentTemplate,
    isDirty,
    isSaving,
    zoom,
    showGrid,
    previewMode,
    saveTemplate,
    setZoom,
    setShowGrid,
    setPreviewMode,
    updateTemplateName,
    updateThumbnail,
  } = useDesignerStore();

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(currentTemplate?.name || '');

  // Generate thumbnail from the canvas
  const generateThumbnail = async (): Promise<string | null> => {
    try {
      const cardElement = document.querySelector('.credential-card-container');
      if (!cardElement) {
        console.warn('Card container not found for thumbnail generation');
        return null;
      }

      const dataUrl = await toPng(cardElement as HTMLElement, {
        quality: 0.8,
        pixelRatio: 1, // Lower for smaller file size
        backgroundColor: 'transparent',
      });

      return dataUrl;
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      return null;
    }
  };

  const handleSave = async () => {
    // Generate thumbnail before saving
    const thumbnail = await generateThumbnail();
    if (thumbnail) {
      updateThumbnail(thumbnail);
    }

    await saveTemplate();
    if (currentTemplate?.id && onSave) {
      onSave(currentTemplate.id);
    }
  };

  const handleExport = () => {
    if (!currentTemplate) return;
    const overlay = exportCraftStateToOCA(currentTemplate.craft_state);
    if (onExport) {
      onExport(overlay);
    }
  };

  const handleNameSubmit = () => {
    updateTemplateName(tempName);
    setIsEditingName(false);
  };

  return (
    <div className="h-14 bg-surface-100 border-b border-border-primary flex items-center px-4 justify-between">
      {/* Left section - Template name and actions */}
      <div className="flex items-center gap-4">
        {/* Back button */}
        <button
          onClick={() => window.history.back()}
          className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-200 rounded transition-colors"
          title="Back"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>

        {/* Template name */}
        {isEditingName ? (
          <input
            type="text"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
            className="px-2 py-1 bg-surface-200 border border-border-secondary rounded text-text-primary text-sm focus:border-primary-500 focus:outline-none"
            autoFocus
          />
        ) : (
          <button
            onClick={() => {
              setTempName(currentTemplate?.name || '');
              setIsEditingName(true);
            }}
            className="text-text-primary font-medium hover:text-primary-500 transition-colors flex items-center gap-1"
          >
            {currentTemplate?.name || 'Untitled'}
            {isDirty && <span className="text-text-tertiary">*</span>}
            <svg className="w-3 h-3 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        )}

        {/* Undo/Redo */}
        <div className="flex items-center border-l border-border-primary pl-4 gap-1">
          <button
            onClick={() => actions.history.undo()}
            disabled={!canUndo}
            className={`p-2 rounded transition-colors ${
              canUndo ? 'text-text-secondary hover:text-text-primary hover:bg-surface-200' : 'text-text-tertiary cursor-not-allowed'
            }`}
            title="Undo"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <button
            onClick={() => actions.history.redo()}
            disabled={!canRedo}
            className={`p-2 rounded transition-colors ${
              canRedo ? 'text-text-secondary hover:text-text-primary hover:bg-surface-200' : 'text-text-tertiary cursor-not-allowed'
            }`}
            title="Redo"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Center section - Zoom controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setZoom(zoom - 0.1)}
          disabled={zoom <= 0.25}
          className="p-1 text-text-secondary hover:text-text-primary hover:bg-surface-200 rounded transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <span className="text-sm text-text-secondary w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(zoom + 0.1)}
          disabled={zoom >= 2}
          className="p-1 text-text-secondary hover:text-text-primary hover:bg-surface-200 rounded transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          onClick={() => setZoom(1)}
          className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-200 rounded transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Right section - View options and actions */}
      <div className="flex items-center gap-3">
        {/* Grid toggle */}
        <button
          onClick={() => setShowGrid(!showGrid)}
          className={`p-2 rounded transition-colors ${
            showGrid ? 'text-primary-500 bg-primary-50 dark:bg-primary-900/30' : 'text-text-secondary hover:text-text-primary hover:bg-surface-200'
          }`}
          title="Toggle Grid"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
        </button>

        {/* Preview toggle */}
        <button
          onClick={() => setPreviewMode(!previewMode)}
          className={`p-2 rounded transition-colors ${
            previewMode ? 'text-primary-500 bg-primary-50 dark:bg-primary-900/30' : 'text-text-secondary hover:text-text-primary hover:bg-surface-200'
          }`}
          title="Preview Mode"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>

        <div className="w-px h-6 bg-border-primary" />

        {/* Export */}
        <button
          onClick={handleExport}
          className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary border border-border-primary hover:border-border-secondary rounded transition-colors"
        >
          Export OCA
        </button>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="btn btn-primary px-4 py-1.5 text-sm flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Saving...
            </>
          ) : (
            'Save'
          )}
        </button>
      </div>
    </div>
  );
}
