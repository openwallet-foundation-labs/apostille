'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { credentialDesignerApi } from '@/lib/credential-designer/api';
import { CardTemplate, PresetTemplate, TEMPLATE_CATEGORIES } from '@/lib/credential-designer/types';

export default function CredentialDesignerPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<CardTemplate[]>([]);
  const [presets, setPresets] = useState<PresetTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateCategory, setNewTemplateCategory] = useState('custom');
  const [selectedPreset, setSelectedPreset] = useState<PresetTemplate | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [templatesRes, presetsRes] = await Promise.all([
        credentialDesignerApi.getTemplates(),
        credentialDesignerApi.getPresets(),
      ]);
      setTemplates(templatesRes.templates);
      setPresets(presetsRes.presets);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = async () => {
    if (!newTemplateName.trim()) return;

    try {
      const craftState = selectedPreset?.craft_state || {
        ROOT: {
          type: { resolvedName: 'CardContainer' },
          isCanvas: true,
          props: {
            backgroundColor: '#1e3a5f',
            backgroundGradient: { type: 'linear', colors: ['#1e3a5f', '#0f1f33'], angle: 135 },
            borderRadius: 12,
            padding: 20,
            shadow: 'lg',
          },
          displayName: 'Card',
          nodes: [],
          linkedNodes: {},
        },
      };

      const result = await credentialDesignerApi.createTemplate({
        name: newTemplateName,
        category: selectedPreset?.category || newTemplateCategory,
        craft_state: craftState,
        oca_branding: selectedPreset?.oca_branding,
        oca_meta: selectedPreset?.oca_meta,
      });

      router.push(`/credential-designer/${result.template.id}`);
    } catch (error) {
      console.error('Failed to create template:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      await credentialDesignerApi.deleteTemplate(id);
      setTemplates(templates.filter((t) => t.id !== id));
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const result = await credentialDesignerApi.duplicateTemplate(id);
      setTemplates([result.template, ...templates]);
    } catch (error) {
      console.error('Failed to duplicate template:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-secondary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowNewModal(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Template
        </button>
      </div>

      {/* Templates grid */}
      {templates.length === 0 ? (
        <div className="card text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-200 flex items-center justify-center">
            <svg className="w-8 h-8 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-2">No templates yet</h3>
          <p className="text-text-secondary mb-6">Create your first credential template to get started</p>
          <button
            onClick={() => setShowNewModal(true)}
            className="btn btn-primary"
          >
            Create Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <div
              key={template.id}
              className="card overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Preview */}
              <div
                className="h-40 flex items-center justify-center"
                style={{
                  backgroundColor: template.oca_branding?.primary_background_color || '#1e3a5f',
                }}
              >
                {template.thumbnail ? (
                  <img
                    src={template.thumbnail}
                    alt={template.name}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <div className="text-white/30 text-sm">No preview</div>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-text-primary">{template.name}</h3>
                    <p className="text-sm text-text-secondary mt-0.5">
                      {template.category || 'Custom'}
                    </p>
                  </div>
                  <span
                    className="px-2 py-0.5 text-xs rounded-full"
                    style={{
                      backgroundColor: template.oca_branding?.primary_background_color || 'var(--surface-200)',
                      color: template.oca_branding?.primary_background_color ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {template.category || 'custom'}
                  </span>
                </div>

                {template.description && (
                  <p className="text-sm text-text-tertiary mt-2 line-clamp-2">
                    {template.description}
                  </p>
                )}

                <div className="text-xs text-text-tertiary mt-3">
                  Updated {new Date(template.updated_at).toLocaleDateString()}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border-primary">
                  <button
                    onClick={() => router.push(`/credential-designer/${template.id}`)}
                    className="flex-1 btn btn-secondary text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDuplicate(template.id)}
                    className="p-2 text-text-tertiary hover:text-text-primary hover:bg-surface-200 rounded-lg transition-colors"
                    title="Duplicate"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="p-2 text-text-tertiary hover:text-error-500 hover:bg-error-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Template Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border-primary">
              <h2 className="text-xl font-semibold text-text-primary">Create New Template</h2>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Template Name
                </label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g., University Degree"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Category
                </label>
                <select
                  value={newTemplateCategory}
                  onChange={(e) => setNewTemplateCategory(e.target.value)}
                  className="input w-full"
                >
                  {TEMPLATE_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Start from preset (optional)
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  <button
                    onClick={() => setSelectedPreset(null)}
                    className={`p-3 rounded-lg border text-left text-sm transition-colors ${
                      !selectedPreset
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                        : 'border-border-primary bg-surface-100 hover:bg-surface-200'
                    }`}
                  >
                    <div className="font-medium text-text-primary">Blank</div>
                    <div className="text-xs text-text-tertiary">Start fresh</div>
                  </button>
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => setSelectedPreset(preset)}
                      className={`p-3 rounded-lg border text-left text-sm transition-colors ${
                        selectedPreset?.id === preset.id
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                          : 'border-border-primary bg-surface-100 hover:bg-surface-200'
                      }`}
                    >
                      <div className="font-medium text-text-primary">{preset.name}</div>
                      <div className="text-xs text-text-tertiary">{preset.category}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-border-primary flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowNewModal(false);
                  setNewTemplateName('');
                  setSelectedPreset(null);
                }}
                className="btn btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNew}
                disabled={!newTemplateName.trim()}
                className="btn btn-primary"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
