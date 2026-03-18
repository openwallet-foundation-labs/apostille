export type FieldType = 'signature' | 'initials' | 'date' | 'name'

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
}

export const FIELD_LABELS: Record<FieldType, string> = {
  signature: 'Sign Here',
  initials: 'Initial Here',
  date: 'Date',
  name: 'Name',
}

export const SIGNATURE_FONTS = [
  'Dancing Script',
  'Great Vibes',
  'Pacifico',
  'Allura',
  'Sacramento',
] as const

export type SignatureFont = (typeof SIGNATURE_FONTS)[number]
