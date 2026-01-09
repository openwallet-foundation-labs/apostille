import React, { useMemo, useState } from 'react'

type Schema = any

export function JsonSchemaForm({ schema, onSubmit, submitLabel = 'Submit' }: { schema: Schema; onSubmit: (values: any) => void; submitLabel?: string }) {
  const [values, setValues] = useState<any>({})

  const rendered = useMemo(() => renderFields(schema, [], values, setValues), [schema, values])

  return (
    <>
      {/* Scoped styles for inputs to respect light/dark via CSS variables with sensible fallbacks */}
      <style>{`
        .wf-form label { display: block; color: var(--text-primary, #e5e7eb); font-size: 0.875rem; margin-bottom: 0.25rem; }
        .wf-form .wf-input {
          width: 100%;
          padding: 0.5rem 0.625rem;
          border-radius: 0.5rem;
          border: 1px solid var(--wf-input-border, var(--border-primary, #4b5563));
          background-color: var(--wf-input-bg, var(--surface-200, #111111));
          color: var(--wf-input-fg, var(--text-primary, #ffffff));
          transition: border-color 0.15s ease, outline-color 0.15s ease, background-color 0.15s ease;
        }
        .wf-form .wf-input::placeholder { color: var(--wf-input-placeholder, #9ca3af); }
        .wf-form .wf-input:disabled { opacity: 0.6; cursor: not-allowed; }
        .wf-form .wf-input:focus {
          outline: 2px solid var(--wf-input-focus, var(--primary-600, #2563eb));
          outline-offset: 1px;
          border-color: var(--wf-input-focus, var(--primary-600, #2563eb));
        }
        .wf-form .wf-checkbox { accent-color: var(--primary-600, #2563eb); }
        .wf-form .wf-submit {
          margin-top: 0.5rem;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          background-color: var(--wf-button-bg, var(--primary-600, #2563eb));
          color: var(--wf-button-fg, #ffffff);
          border: 1px solid var(--wf-button-border, transparent);
        }
      `}</style>
      <form
        className="wf-form"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(values)
        }}
      >
        <div className="space-y-2">{rendered}</div>
        <button type="submit" className="wf-submit">{submitLabel}</button>
      </form>
    </>
  )
}

function renderFields(schema: any, prefix: string[], values: any, setValues: (v: any) => void): React.ReactNode {
  if (!schema || schema.type !== 'object' || !schema.properties) return null
  const props = schema.properties as Record<string, any>
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : []
  const nodes: React.ReactNode[] = []
  for (const [key, def] of Object.entries(props)) {
    const path = [...prefix, key]
    if (def && def.type === 'object' && def.properties) {
      nodes.push(
        <div key={path.join('.')}>
          <div className="text-sm font-medium">{def.title || key}</div>
          {renderFields(def, path, values, setValues)}
        </div>
      )
      continue
    }
    const isReq = required.includes(key)
    const val = getAt(values, path)
    const type = def?.type === 'number' ? 'number' : def?.type === 'boolean' ? 'checkbox' : 'text'
    nodes.push(
      <div key={path.join('.')}>
        <label>
          {def?.title || key}
          {isReq ? ' *' : ''}
        </label>
        {type === 'checkbox' ? (
          <input
            className="wf-checkbox"
            type="checkbox"
            checked={!!val}
            onChange={(e) => setValues(setAt(values, path, (e.target as HTMLInputElement).checked))}
          />
        ) : (
          <input
            className="wf-input"
            type={type}
            value={val ?? ''}
            onChange={(e) => setValues(setAt(values, path, type === 'number' ? Number((e.target as HTMLInputElement).value) : (e.target as HTMLInputElement).value))}
          />
        )}
      </div>
    )
  }
  return nodes
}

function getAt(obj: any, path: string[]) {
  return path.reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), obj)
}

function setAt(obj: any, path: string[], value: any) {
  const next = { ...(obj || {}) }
  let cur: any = next
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]
    cur[k] = { ...(cur[k] || {}) }
    cur = cur[k]
  }
  cur[path[path.length - 1]] = value
  return next
}
