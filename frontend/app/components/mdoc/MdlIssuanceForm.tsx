'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  MDL_DOCTYPE,
  MID_DOCTYPE,
  MDL_STANDARD_ATTRIBUTES,
  MID_STANDARD_ATTRIBUTES,
  type MdocCredentialData,
  type MdocNamespace,
} from '@/lib/api';

interface DrivingPrivilege {
  vehicle_category_code: string;
  issue_date?: string;
  expiry_date?: string;
  codes?: Array<{ code: string; sign?: string; value?: string }>;
}

interface MdlIssuanceFormProps {
  doctype: string;
  selectedAttributes: string[];
  onDataChange: (data: MdocCredentialData) => void;
  initialData?: MdocCredentialData;
}

// Vehicle category codes for driving privileges
const VEHICLE_CATEGORIES = [
  { code: 'AM', description: 'Mopeds' },
  { code: 'A1', description: 'Light motorcycles' },
  { code: 'A2', description: 'Medium motorcycles' },
  { code: 'A', description: 'Motorcycles' },
  { code: 'B1', description: 'Tricycles and quadricycles' },
  { code: 'B', description: 'Motor vehicles up to 3,500 kg' },
  { code: 'C1', description: 'Goods vehicles 3,500-7,500 kg' },
  { code: 'C', description: 'Goods vehicles over 3,500 kg' },
  { code: 'D1', description: 'Minibuses up to 16 passengers' },
  { code: 'D', description: 'Buses over 8 passengers' },
  { code: 'BE', description: 'Car + trailer' },
  { code: 'C1E', description: 'C1 + trailer' },
  { code: 'CE', description: 'C + trailer' },
  { code: 'D1E', description: 'D1 + trailer' },
  { code: 'DE', description: 'D + trailer' },
];

export default function MdlIssuanceForm({
  doctype,
  selectedAttributes,
  onDataChange,
  initialData,
}: MdlIssuanceFormProps) {
  // Form state
  const [formData, setFormData] = useState<MdocCredentialData>(
    initialData || {
      family_name: '',
      given_name: '',
      birth_date: '',
      issue_date: new Date().toISOString().split('T')[0],
      expiry_date: '',
      issuing_country: '',
      issuing_authority: '',
      document_number: '',
      portrait: '',
      driving_privileges: [],
    }
  );

  const [drivingPrivileges, setDrivingPrivileges] = useState<DrivingPrivilege[]>([
    { vehicle_category_code: 'B' },
  ]);

  const [portraitPreview, setPortraitPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get the appropriate attributes for the selected doctype
  const getAttributesForDoctype = (): MdocNamespace => {
    if (doctype === MDL_DOCTYPE) {
      return MDL_STANDARD_ATTRIBUTES;
    } else if (doctype === MID_DOCTYPE) {
      return MID_STANDARD_ATTRIBUTES;
    }
    return {};
  };

  const attributes = getAttributesForDoctype();

  // Update parent when form data changes
  useEffect(() => {
    const dataWithPrivileges = {
      ...formData,
      driving_privileges: drivingPrivileges.filter((p) => p.vehicle_category_code),
    };
    onDataChange(dataWithPrivileges);
  }, [formData, drivingPrivileges]);

  // Handle text input changes
  const handleInputChange = (field: string, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Handle portrait upload
  const handlePortraitUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('Image size must be less than 2MB');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setPortraitPreview(base64);
      // Remove the data:image/xxx;base64, prefix for storage
      const base64Data = base64.split(',')[1];
      handleInputChange('portrait', base64Data);
    };
    reader.readAsDataURL(file);
  };

  // Handle driving privilege changes
  const addDrivingPrivilege = () => {
    setDrivingPrivileges((prev) => [...prev, { vehicle_category_code: '' }]);
  };

  const removeDrivingPrivilege = (index: number) => {
    setDrivingPrivileges((prev) => prev.filter((_, i) => i !== index));
  };

  const updateDrivingPrivilege = (index: number, field: string, value: string) => {
    setDrivingPrivileges((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  };

  // Check if attribute is required and selected
  const isAttributeEnabled = (attrName: string) => {
    return selectedAttributes.includes(attrName);
  };

  // Render field based on type
  const renderField = (attrName: string) => {
    const attr = attributes[attrName];
    if (!attr || !isAttributeEnabled(attrName)) return null;

    const label = attr.display || attrName.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
    const isRequired = attr.required;

    switch (attr.type) {
      case 'full-date':
        return (
          <div key={attrName}>
            <label className="form-label">
              {label} {isRequired && <span className="text-error-500">*</span>}
            </label>
            <input
              type="date"
              value={(formData[attrName] as string) || ''}
              onChange={(e) => handleInputChange(attrName, e.target.value)}
              className="input w-full"
              required={isRequired}
            />
          </div>
        );

      case 'bstr':
        // Binary field (image upload for portrait)
        if (attrName === 'portrait') {
          return (
            <div key={attrName} className="col-span-2">
              <label className="form-label">
                {label} {isRequired && <span className="text-error-500">*</span>}
              </label>
              <div className="flex items-start gap-4">
                <div
                  className="w-24 h-32 border-2 border-dashed border-border-secondary rounded-lg flex items-center justify-center overflow-hidden bg-surface-100 cursor-pointer hover:bg-surface-200"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {portraitPreview ? (
                    <img
                      src={portraitPreview}
                      alt="Portrait preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center p-2">
                      <svg
                        className="mx-auto h-8 w-8 text-text-tertiary"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="text-xs text-text-tertiary">Upload</span>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={handlePortraitUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="btn btn-secondary text-sm"
                  >
                    Choose File
                  </button>
                  <p className="mt-2 text-xs text-text-tertiary">
                    JPEG or PNG, max 2MB
                  </p>
                  {portraitPreview && (
                    <button
                      type="button"
                      onClick={() => {
                        setPortraitPreview(null);
                        handleInputChange('portrait', '');
                      }}
                      className="mt-2 text-sm text-error-600 hover:text-error-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        }
        return null;

      case 'uint':
        return (
          <div key={attrName}>
            <label className="form-label">
              {label} {isRequired && <span className="text-error-500">*</span>}
            </label>
            <input
              type="number"
              min="0"
              value={(formData[attrName] as number) || ''}
              onChange={(e) => handleInputChange(attrName, parseInt(e.target.value) || 0)}
              className="input w-full"
              required={isRequired}
            />
            {attrName === 'sex' && (
              <p className="mt-1 text-xs text-text-tertiary">0=Unknown, 1=Male, 2=Female</p>
            )}
          </div>
        );

      case 'bool':
        return (
          <div key={attrName} className="flex items-center gap-2">
            <input
              type="checkbox"
              id={attrName}
              checked={(formData[attrName] as boolean) || false}
              onChange={(e) => handleInputChange(attrName, e.target.checked)}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-border-secondary rounded"
            />
            <label htmlFor={attrName} className="text-sm font-medium text-text-secondary">
              {label}
            </label>
          </div>
        );

      case 'array':
        // Driving privileges
        if (attrName === 'driving_privileges') {
          return (
            <div key={attrName} className="col-span-2">
              <label className="form-label mb-2">
                {label} {isRequired && <span className="text-error-500">*</span>}
              </label>
              <div className="space-y-3">
                {drivingPrivileges.map((privilege, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-surface-100 rounded-lg">
                    <div className="flex-1 grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-text-tertiary mb-1">Category</label>
                        <select
                          value={privilege.vehicle_category_code}
                          onChange={(e) =>
                            updateDrivingPrivilege(index, 'vehicle_category_code', e.target.value)
                          }
                          className="input w-full text-sm"
                        >
                          <option value="">Select</option>
                          {VEHICLE_CATEGORIES.map((cat) => (
                            <option key={cat.code} value={cat.code}>
                              {cat.code} - {cat.description}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-text-tertiary mb-1">Issue Date</label>
                        <input
                          type="date"
                          value={privilege.issue_date || ''}
                          onChange={(e) =>
                            updateDrivingPrivilege(index, 'issue_date', e.target.value)
                          }
                          className="input w-full text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-text-tertiary mb-1">Expiry Date</label>
                        <input
                          type="date"
                          value={privilege.expiry_date || ''}
                          onChange={(e) =>
                            updateDrivingPrivilege(index, 'expiry_date', e.target.value)
                          }
                          className="input w-full text-sm"
                        />
                      </div>
                    </div>
                    {drivingPrivileges.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDrivingPrivilege(index)}
                        className="p-1 text-text-tertiary hover:text-error-500"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addDrivingPrivilege}
                  className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                  Add Category
                </button>
              </div>
            </div>
          );
        }
        return null;

      default:
        // Text field
        return (
          <div key={attrName}>
            <label className="form-label">
              {label} {isRequired && <span className="text-error-500">*</span>}
            </label>
            <input
              type="text"
              value={(formData[attrName] as string) || ''}
              onChange={(e) => handleInputChange(attrName, e.target.value)}
              className="input w-full"
              required={isRequired}
              placeholder={getPlaceholder(attrName)}
            />
          </div>
        );
    }
  };

  // Get placeholder text for common fields
  const getPlaceholder = (attrName: string): string => {
    const placeholders: Record<string, string> = {
      family_name: 'e.g., Smith',
      given_name: 'e.g., John',
      issuing_country: 'e.g., IN (2-letter ISO code)',
      issuing_authority: 'e.g., Transport Department',
      document_number: 'e.g., DL1234567890',
      birth_place: 'e.g., New Delhi',
      resident_address: 'e.g., 123 Main Street',
      resident_city: 'e.g., Mumbai',
      resident_state: 'e.g., Maharashtra',
      resident_postal_code: 'e.g., 400001',
      resident_country: 'e.g., IN',
      nationality: 'e.g., Indian',
      eye_colour: 'e.g., Brown',
      hair_colour: 'e.g., Black',
    };
    return placeholders[attrName] || '';
  };

  // Group attributes for better layout
  const personalAttributes = ['family_name', 'given_name', 'birth_date', 'sex', 'nationality', 'birth_place'];
  const documentAttributes = ['document_number', 'issue_date', 'expiry_date', 'issuing_country', 'issuing_authority'];
  const addressAttributes = ['resident_address', 'resident_city', 'resident_state', 'resident_postal_code', 'resident_country'];
  const physicalAttributes = ['height', 'weight', 'eye_colour', 'hair_colour'];
  const ageAttributes = ['age_over_18', 'age_over_21'];
  const otherAttributes = selectedAttributes.filter(
    (attr) =>
      ![...personalAttributes, ...documentAttributes, ...addressAttributes, ...physicalAttributes, ...ageAttributes, 'portrait', 'driving_privileges'].includes(attr)
  );

  return (
    <div className="space-y-6">
      {/* Portrait Section */}
      {isAttributeEnabled('portrait') && (
        <div className="pb-4 border-b border-border-secondary">
          <h4 className="text-sm font-semibold text-text-primary mb-3">Photo</h4>
          {renderField('portrait')}
        </div>
      )}

      {/* Personal Information */}
      {personalAttributes.some((attr) => isAttributeEnabled(attr)) && (
        <div className="pb-4 border-b border-border-secondary">
          <h4 className="text-sm font-semibold text-text-primary mb-3">Personal Information</h4>
          <div className="grid grid-cols-2 gap-4">
            {personalAttributes.map((attr) => renderField(attr))}
          </div>
        </div>
      )}

      {/* Document Information */}
      {documentAttributes.some((attr) => isAttributeEnabled(attr)) && (
        <div className="pb-4 border-b border-border-secondary">
          <h4 className="text-sm font-semibold text-text-primary mb-3">Document Information</h4>
          <div className="grid grid-cols-2 gap-4">
            {documentAttributes.map((attr) => renderField(attr))}
          </div>
        </div>
      )}

      {/* Address Information */}
      {addressAttributes.some((attr) => isAttributeEnabled(attr)) && (
        <div className="pb-4 border-b border-border-secondary">
          <h4 className="text-sm font-semibold text-text-primary mb-3">Address</h4>
          <div className="grid grid-cols-2 gap-4">
            {addressAttributes.map((attr) => renderField(attr))}
          </div>
        </div>
      )}

      {/* Physical Characteristics */}
      {physicalAttributes.some((attr) => isAttributeEnabled(attr)) && (
        <div className="pb-4 border-b border-border-secondary">
          <h4 className="text-sm font-semibold text-text-primary mb-3">Physical Characteristics</h4>
          <div className="grid grid-cols-2 gap-4">
            {physicalAttributes.map((attr) => renderField(attr))}
          </div>
        </div>
      )}

      {/* Age Verification */}
      {ageAttributes.some((attr) => isAttributeEnabled(attr)) && (
        <div className="pb-4 border-b border-border-secondary">
          <h4 className="text-sm font-semibold text-text-primary mb-3">Age Verification</h4>
          <div className="flex gap-6">
            {ageAttributes.map((attr) => renderField(attr))}
          </div>
        </div>
      )}

      {/* Driving Privileges (mDL only) */}
      {isAttributeEnabled('driving_privileges') && (
        <div className="pb-4 border-b border-border-secondary">
          <h4 className="text-sm font-semibold text-text-primary mb-3">Driving Privileges</h4>
          {renderField('driving_privileges')}
        </div>
      )}

      {/* Other Attributes */}
      {otherAttributes.length > 0 && (
        <div className="pb-4">
          <h4 className="text-sm font-semibold text-text-primary mb-3">Additional Information</h4>
          <div className="grid grid-cols-2 gap-4">
            {otherAttributes.map((attr) => renderField(attr))}
          </div>
        </div>
      )}
    </div>
  );
}
