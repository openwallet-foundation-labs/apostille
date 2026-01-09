/**
 * mDL (Mobile Driver's License) Utilities
 *
 * ISO 18013-5 compliant mDL/mdoc credential support
 */

// Document Types
export const MDL_DOCTYPE = 'org.iso.18013.5.1.mDL'
export const MID_DOCTYPE = 'org.iso.23220.1.mID'

// Namespaces
export const MDL_NAMESPACE = 'org.iso.18013.5.1'
export const MID_NAMESPACE = 'org.iso.23220.1'

// Attribute type definitions
export type MdocAttributeType = 'string' | 'full-date' | 'bstr' | 'uint' | 'bool' | 'array' | 'tstr'

export interface MdocAttributeDefinition {
  type: MdocAttributeType
  required: boolean
  display: string
  description?: string
}

export interface MdocNamespaceDefinition {
  [attribute: string]: MdocAttributeDefinition
}

/**
 * ISO 18013-5 mDL Mandatory and Optional Data Elements
 */
export const MDL_ATTRIBUTES: MdocNamespaceDefinition = {
  // Mandatory data elements
  family_name: { type: 'tstr', required: true, display: 'Family Name', description: 'Last name, surname, or primary identifier' },
  given_name: { type: 'tstr', required: true, display: 'Given Name', description: 'First name(s), other name(s), or secondary identifier' },
  birth_date: { type: 'full-date', required: true, display: 'Date of Birth', description: 'Day, month and year on which the mDL holder was born' },
  issue_date: { type: 'full-date', required: true, display: 'Date of Issue', description: 'Date when mDL was issued' },
  expiry_date: { type: 'full-date', required: true, display: 'Date of Expiry', description: 'Date when mDL expires' },
  issuing_country: { type: 'tstr', required: true, display: 'Issuing Country', description: 'Alpha-2 country code as per ISO 3166-1' },
  issuing_authority: { type: 'tstr', required: true, display: 'Issuing Authority', description: 'Issuing authority name' },
  document_number: { type: 'tstr', required: true, display: 'Document Number', description: 'The number assigned to the mDL' },
  portrait: { type: 'bstr', required: true, display: 'Portrait', description: 'A reproduction of the mDL holder\'s portrait' },
  driving_privileges: { type: 'array', required: true, display: 'Driving Privileges', description: 'Driving privileges of the mDL holder' },

  // Optional data elements
  un_distinguishing_sign: { type: 'tstr', required: false, display: 'UN Distinguishing Sign', description: 'Distinguishing sign of the issuing country per UN conventions' },
  administrative_number: { type: 'tstr', required: false, display: 'Administrative Number', description: 'An audit control number assigned by the issuing authority' },
  sex: { type: 'uint', required: false, display: 'Sex', description: '1 = male, 2 = female' },
  height: { type: 'uint', required: false, display: 'Height', description: 'mDL holder\'s height in centimetres' },
  weight: { type: 'uint', required: false, display: 'Weight', description: 'mDL holder\'s weight in kilograms' },
  eye_colour: { type: 'tstr', required: false, display: 'Eye Colour', description: 'mDL holder\'s eye colour' },
  hair_colour: { type: 'tstr', required: false, display: 'Hair Colour', description: 'mDL holder\'s hair colour' },
  birth_place: { type: 'tstr', required: false, display: 'Place of Birth', description: 'Country and municipality or state/province where mDL holder was born' },
  resident_address: { type: 'tstr', required: false, display: 'Resident Address', description: 'The place where the mDL holder resides' },
  resident_city: { type: 'tstr', required: false, display: 'Resident City', description: 'The city where the mDL holder resides' },
  resident_state: { type: 'tstr', required: false, display: 'Resident State', description: 'The state/province where the mDL holder resides' },
  resident_postal_code: { type: 'tstr', required: false, display: 'Resident Postal Code', description: 'The postal code of the mDL holder' },
  resident_country: { type: 'tstr', required: false, display: 'Resident Country', description: 'The country where the mDL holder resides' },
  age_in_years: { type: 'uint', required: false, display: 'Age in Years', description: 'The age of the mDL holder' },
  age_birth_year: { type: 'uint', required: false, display: 'Year of Birth', description: 'The year when the mDL holder was born' },
  age_over_18: { type: 'bool', required: false, display: 'Age Over 18', description: 'Whether the mDL holder is over 18' },
  age_over_21: { type: 'bool', required: false, display: 'Age Over 21', description: 'Whether the mDL holder is over 21' },
  age_over_25: { type: 'bool', required: false, display: 'Age Over 25', description: 'Whether the mDL holder is over 25' },
  age_over_65: { type: 'bool', required: false, display: 'Age Over 65', description: 'Whether the mDL holder is over 65' },
  issuing_jurisdiction: { type: 'tstr', required: false, display: 'Issuing Jurisdiction', description: 'Country subdivision code per ISO 3166-2' },
  nationality: { type: 'tstr', required: false, display: 'Nationality', description: 'Nationality of the mDL holder' },
  portrait_capture_date: { type: 'full-date', required: false, display: 'Portrait Capture Date', description: 'Date when portrait was taken' },
  family_name_national_character: { type: 'tstr', required: false, display: 'Family Name (National)', description: 'Family name in national characters' },
  given_name_national_character: { type: 'tstr', required: false, display: 'Given Name (National)', description: 'Given name in national characters' },
  signature_usual_mark: { type: 'bstr', required: false, display: 'Signature', description: 'Image of the signature or usual mark of the mDL holder' },
}

/**
 * ISO 23220 Mobile ID (mID) Data Elements
 */
export const MID_ATTRIBUTES: MdocNamespaceDefinition = {
  family_name: { type: 'tstr', required: true, display: 'Family Name', description: 'Last name or surname' },
  given_name: { type: 'tstr', required: true, display: 'Given Name', description: 'First name(s)' },
  birth_date: { type: 'full-date', required: true, display: 'Date of Birth', description: 'Date of birth' },
  portrait: { type: 'bstr', required: false, display: 'Portrait', description: 'Portrait image' },
  nationality: { type: 'tstr', required: false, display: 'Nationality', description: 'Nationality' },
  document_number: { type: 'tstr', required: false, display: 'Document Number', description: 'ID document number' },
  administrative_number: { type: 'tstr', required: false, display: 'Administrative Number', description: 'Administrative or personal ID number' },
  issuing_authority: { type: 'tstr', required: false, display: 'Issuing Authority', description: 'Name of issuing authority' },
  issuing_country: { type: 'tstr', required: false, display: 'Issuing Country', description: 'Country code' },
  issue_date: { type: 'full-date', required: false, display: 'Issue Date', description: 'Date of issuance' },
  expiry_date: { type: 'full-date', required: false, display: 'Expiry Date', description: 'Date of expiry' },
  sex: { type: 'uint', required: false, display: 'Sex', description: '1 = male, 2 = female' },
  age_over_18: { type: 'bool', required: false, display: 'Age Over 18', description: 'Whether over 18 years old' },
  age_over_21: { type: 'bool', required: false, display: 'Age Over 21', description: 'Whether over 21 years old' },
  resident_address: { type: 'tstr', required: false, display: 'Resident Address', description: 'Residential address' },
  resident_city: { type: 'tstr', required: false, display: 'Resident City', description: 'City of residence' },
  resident_state: { type: 'tstr', required: false, display: 'Resident State', description: 'State/Province of residence' },
  resident_postal_code: { type: 'tstr', required: false, display: 'Resident Postal Code', description: 'Postal code' },
  resident_country: { type: 'tstr', required: false, display: 'Resident Country', description: 'Country of residence' },
}

/**
 * Driving privilege categories (ISO 18013-5)
 */
export const DRIVING_PRIVILEGE_CATEGORIES = [
  { code: 'AM', description: 'Mopeds' },
  { code: 'A1', description: 'Light motorcycles' },
  { code: 'A2', description: 'Medium motorcycles' },
  { code: 'A', description: 'Motorcycles' },
  { code: 'B1', description: 'Light quadricycles' },
  { code: 'B', description: 'Motor vehicles ≤3500kg' },
  { code: 'BE', description: 'Motor vehicles with trailer' },
  { code: 'C1', description: 'Medium goods vehicles' },
  { code: 'C1E', description: 'Medium goods vehicles with trailer' },
  { code: 'C', description: 'Large goods vehicles' },
  { code: 'CE', description: 'Large goods vehicles with trailer' },
  { code: 'D1', description: 'Small buses' },
  { code: 'D1E', description: 'Small buses with trailer' },
  { code: 'D', description: 'Buses' },
  { code: 'DE', description: 'Buses with trailer' },
]

/**
 * Get attributes for a specific document type
 */
export function getAttributesForDoctype(doctype: string): MdocNamespaceDefinition {
  switch (doctype) {
    case MDL_DOCTYPE:
      return MDL_ATTRIBUTES
    case MID_DOCTYPE:
      return MID_ATTRIBUTES
    default:
      return {}
  }
}

/**
 * Get namespace for a document type
 */
export function getNamespaceForDoctype(doctype: string): string {
  switch (doctype) {
    case MDL_DOCTYPE:
      return MDL_NAMESPACE
    case MID_DOCTYPE:
      return MID_NAMESPACE
    default:
      // For custom doctypes, derive namespace from doctype
      const parts = doctype.split('.')
      return parts.slice(0, -1).join('.')
  }
}

/**
 * Get default namespaces configuration for a document type
 */
export function getDefaultNamespaces(doctype: string): Record<string, MdocNamespaceDefinition> {
  const namespace = getNamespaceForDoctype(doctype)
  const attributes = getAttributesForDoctype(doctype)

  return {
    [namespace]: attributes
  }
}

/**
 * Build mdoc namespaces from credential data
 */
export function buildMdocNamespaces(
  data: Record<string, any>,
  doctype: string = MDL_DOCTYPE
): Record<string, Record<string, any>> {
  const namespace = getNamespaceForDoctype(doctype)
  const attributeDefs = getAttributesForDoctype(doctype)

  const namespaceData: Record<string, any> = {}

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '') {
      continue
    }

    const attrDef = attributeDefs[key]
    if (!attrDef) {
      // Allow unknown attributes for custom doctypes
      namespaceData[key] = value
      continue
    }

    // Type conversion based on attribute definition
    switch (attrDef.type) {
      case 'full-date':
        // Keep dates as ISO date strings (YYYY-MM-DD format)
        // mdoc CBOR encoding expects string dates, not Date objects
        if (value instanceof Date) {
          namespaceData[key] = value.toISOString().split('T')[0]
        } else if (typeof value === 'string') {
          // Validate and normalize the date string
          const dateStr = value.includes('T') ? value.split('T')[0] : value
          namespaceData[key] = dateStr
        } else {
          namespaceData[key] = String(value)
        }
        break
      case 'bstr':
        // Binary data - expect base64 string or Uint8Array
        if (typeof value === 'string') {
          // Remove data URL prefix if present
          const base64Data = value.replace(/^data:[^;]+;base64,/, '')
          namespaceData[key] = Buffer.from(base64Data, 'base64')
        } else if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
          namespaceData[key] = value
        }
        break
      case 'uint':
        namespaceData[key] = typeof value === 'number' ? value : parseInt(value, 10)
        break
      case 'bool':
        namespaceData[key] = typeof value === 'boolean' ? value : value === 'true' || value === true
        break
      case 'array':
        namespaceData[key] = Array.isArray(value) ? value : [value]
        break
      default:
        namespaceData[key] = String(value)
    }
  }

  return {
    [namespace]: namespaceData
  }
}

/**
 * Validate mDL data against schema requirements
 */
export function validateMdlData(data: Record<string, any>, doctype: string = MDL_DOCTYPE): {
  valid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []
  const attributeDefs = getAttributesForDoctype(doctype)

  // Check required attributes
  for (const [key, def] of Object.entries(attributeDefs)) {
    if (def.required && (data[key] === undefined || data[key] === null || data[key] === '')) {
      errors.push(`Missing required attribute: ${key} (${def.display})`)
    }
  }

  // Validate specific fields
  if (data.issuing_country && data.issuing_country.length !== 2) {
    warnings.push('issuing_country should be a 2-letter ISO 3166-1 alpha-2 code')
  }

  if (data.sex !== undefined && ![1, 2].includes(Number(data.sex))) {
    warnings.push('sex should be 1 (male) or 2 (female)')
  }

  // Validate date fields
  const dateFields = ['birth_date', 'issue_date', 'expiry_date', 'portrait_capture_date']
  for (const field of dateFields) {
    if (data[field]) {
      const date = new Date(data[field])
      if (isNaN(date.getTime())) {
        errors.push(`Invalid date format for ${field}`)
      }
    }
  }

  // Validate driving_privileges for mDL
  if (doctype === MDL_DOCTYPE && data.driving_privileges) {
    if (!Array.isArray(data.driving_privileges)) {
      errors.push('driving_privileges must be an array')
    } else {
      for (const privilege of data.driving_privileges) {
        if (!privilege.vehicle_category_code) {
          warnings.push('Each driving privilege should have a vehicle_category_code')
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Build claims structure for OID4VCI credential metadata
 */
export function buildMdocClaimsFromNamespaces(
  namespaces: Record<string, MdocNamespaceDefinition> | null | undefined
): Record<string, Record<string, { display: Array<{ name: string; locale: string }> }>> {
  if (!namespaces) {
    return {}
  }

  const claims: Record<string, Record<string, { display: Array<{ name: string; locale: string }> }>> = {}

  for (const [namespace, attributes] of Object.entries(namespaces)) {
    claims[namespace] = {}
    for (const [attrName, attrDef] of Object.entries(attributes)) {
      claims[namespace][attrName] = {
        display: [{ name: attrDef.display, locale: 'en' }]
      }
    }
  }

  return claims
}

/**
 * Calculate age-related boolean fields from birth_date
 */
export function calculateAgeFields(birthDate: Date | string): {
  age_in_years: number
  age_birth_year: number
  age_over_18: boolean
  age_over_21: boolean
  age_over_25: boolean
  age_over_65: boolean
} {
  const birth = birthDate instanceof Date ? birthDate : new Date(birthDate)
  const today = new Date()

  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }

  return {
    age_in_years: age,
    age_birth_year: birth.getFullYear(),
    age_over_18: age >= 18,
    age_over_21: age >= 21,
    age_over_25: age >= 25,
    age_over_65: age >= 65,
  }
}

/**
 * Supported document types
 */
export const SUPPORTED_DOCTYPES = [
  { value: MDL_DOCTYPE, label: 'Mobile Driver\'s License (mDL)', namespace: MDL_NAMESPACE },
  { value: MID_DOCTYPE, label: 'Mobile ID (mID)', namespace: MID_NAMESPACE },
]
