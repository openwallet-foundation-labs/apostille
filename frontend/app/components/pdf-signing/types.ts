export type FieldType =
  | 'signature'
  | 'initials'
  | 'date'
  | 'name'
  | 'note'
  | 'stamp'
  | 'text'
  | 'number'
  | 'drawing'
  | 'formula'
  | 'email'

export interface SigningField {
  id: string
  type: FieldType
  page: number // 0-indexed
  x: number // percentage of page width (0-100)
  y: number // percentage of page height (0-100)
  width: number // percentage of page width
  height: number // percentage of page height
  required: boolean
  label?: string
}

export interface SignatureAdoption {
  type: 'typed' | 'drawn' | 'uploaded'
  dataUrl: string // PNG data URL
  name?: string
  fontFamily?: string
}

export interface FieldCompletionState {
  [fieldId: string]: SignatureAdoption | string // SignatureAdoption for signature/initials, string for date/name
}

export const DEFAULT_FIELD_SIZES: Record<FieldType, { width: number; height: number }> = {
  signature: { width: 20, height: 6 },
  initials: { width: 10, height: 6 },
  date: { width: 15, height: 4 },
  name: { width: 20, height: 4 },
  note: { width: 30, height: 10 },
  stamp: { width: 18, height: 10 },
  text: { width: 20, height: 4 },
  number: { width: 12, height: 4 },
  drawing: { width: 22, height: 12 },
  formula: { width: 24, height: 6 },
  email: { width: 24, height: 4 },
}

export const FIELD_LABELS: Record<FieldType, string> = {
  signature: 'Sign Here',
  initials: 'Initial Here',
  date: 'Date',
  name: 'Name',
  note: 'Note',
  stamp: 'Stamp',
  text: 'Text',
  number: 'Number',
  drawing: 'Drawing',
  formula: 'Formula',
  email: 'Email',
}

export const SIGNATURE_FONTS = [
  'Dancing Script',
  'Great Vibes',
  'Pacifico',
  'Allura',
  'Sacramento',
] as const

export type SignatureFont = (typeof SIGNATURE_FONTS)[number]
