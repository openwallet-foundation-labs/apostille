'use client';

import React from 'react';
import { useEditor } from '@craftjs/core';

export default function DesignerProperties() {
  const { selected, actions } = useEditor((state) => {
    const currentNodeId = state.events.selected.size === 1
      ? Array.from(state.events.selected)[0]
      : null;

    let selected = null;
    if (currentNodeId) {
      const node = state.nodes[currentNodeId];
      if (node) {
        selected = {
          id: currentNodeId,
          name: node.data.displayName || node.data.name,
          settings: node.related?.settings,
          isDeletable: node.data.props && currentNodeId !== 'ROOT',
        };
      }
    }

    return { selected };
  });

  const handleDelete = () => {
    if (selected?.id) {
      actions.delete(selected.id);
    }
  };

  return (
    <div className="w-72 bg-surface-100 border-l border-border-primary flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border-primary">
        <h2 className="text-sm font-semibold text-text-primary">
          {selected ? selected.name : 'Properties'}
        </h2>
        {!selected && (
          <p className="text-xs text-text-tertiary mt-1">
            Select an element to edit its properties
          </p>
        )}
      </div>

      {/* Settings */}
      <div className="flex-1 overflow-y-auto p-4">
        {selected?.settings ? (
          React.createElement(selected.settings)
        ) : selected ? (
          <div className="text-sm text-text-tertiary">
            No settings available for this element
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center py-8">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-surface-200 flex items-center justify-center">
                <svg className="w-6 h-6 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
              </div>
              <p className="text-sm text-text-tertiary">
                Click on an element in the canvas to select it
              </p>
            </div>

            {/* Tips */}
            <div className="bg-surface-200/50 rounded-lg p-3">
              <h3 className="text-xs font-semibold text-text-secondary mb-2">Tips</h3>
              <ul className="space-y-1.5 text-xs text-text-tertiary">
                <li className="flex items-start gap-2">
                  <span className="text-text-tertiary">•</span>
                  Drag elements from the sidebar to add them
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-text-tertiary">•</span>
                  Double-click text to edit inline
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-text-tertiary">•</span>
                  Press <kbd className="px-1 py-0.5 bg-surface-300 rounded text-[10px]">Delete</kbd> or <kbd className="px-1 py-0.5 bg-surface-300 rounded text-[10px]">Backspace</kbd> to remove selected
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-text-tertiary">•</span>
                  Use attributes for dynamic credential data
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {selected?.isDeletable && (
        <div className="p-4 border-t border-border-primary">
          <button
            onClick={handleDelete}
            className="w-full px-4 py-2 bg-error-50 dark:bg-error-900/30 border border-error-200 dark:border-error-700/50 text-error-600 dark:text-error-400 rounded hover:bg-error-100 dark:hover:bg-error-900/50 transition-colors text-sm flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete Element
          </button>
        </div>
      )}
    </div>
  );
}
