'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with Craft.js
const CredentialDesigner = dynamic(
  () => import('@/app/components/credential-designer/CredentialDesigner'),
  {
    ssr: false,
    loading: () => (
      <div className="h-screen flex items-center justify-center bg-surface-100">
        <div className="text-text-secondary">Loading designer...</div>
      </div>
    ),
  }
);

export default function CredentialDesignerEditorPage() {
  const params = useParams();
  const router = useRouter();
  const templateId = params.id as string;

  const handleSave = (savedTemplateId: string) => {
    console.log('Template saved:', savedTemplateId);
  };

  const handleExport = (overlay: any) => {
    // Download as JSON file
    const blob = new Blob([JSON.stringify(overlay, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'oca-overlay.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle "new" route
  if (templateId === 'new') {
    return (
      <CredentialDesigner
        onSave={handleSave}
        onExport={handleExport}
      />
    );
  }

  return (
    <CredentialDesigner
      templateId={templateId}
      onSave={handleSave}
      onExport={handleExport}
    />
  );
}
