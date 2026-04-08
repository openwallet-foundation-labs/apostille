'use client'

import { useState } from 'react'

interface NameAdoptionModalProps {
  initialName?: string
  onAdopt: (name: string) => void
  onCancel: () => void
  title?: string
  placeholder?: string
  buttonLabel?: string
  inputType?: string
  multiline?: boolean
}

export default function NameAdoptionModal({
  initialName = '',
  onAdopt,
  onCancel,
  title = 'Enter Text',
  placeholder = 'Type here',
  buttonLabel = 'Apply',
  inputType = 'text',
  multiline = false,
}: NameAdoptionModalProps) {
  const [name, setName] = useState(initialName)

  const canAdopt = name.trim().length > 0

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-xl shadow-2xl w-[420px] max-h-[90vh] overflow-hidden">
        <div className="px-5 py-4 border-b border-border-primary">
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
          
        </div>

        <div className="p-5">
          {multiline ? (
            <textarea
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={placeholder}
              className="w-full px-3 py-2 rounded-lg border border-border-primary bg-bg-secondary text-text-primary text-sm min-h-[120px]"
              autoFocus
            />
          ) : (
            <input
              type={inputType}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={placeholder}
              className="w-full px-3 py-2 rounded-lg border border-border-primary bg-bg-secondary text-text-primary text-sm"
              autoFocus
            />
          )}
        </div>

        <div className="px-5 py-4 border-t border-border-primary flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-bg-tertiary"
          >
            Cancel
          </button>
          <button
            onClick={() => onAdopt(name.trim())}
            disabled={!canAdopt}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-primary text-black hover:bg-accent-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
