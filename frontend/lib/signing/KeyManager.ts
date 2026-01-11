/**
 * Key Manager for client-side signing key generation, import, and export
 *
 * Uses WebCrypto for key generation and PKI.js for X.509 certificates and PKCS#12
 */

import * as pkijs from 'pkijs';
import * as asn1js from 'asn1js';
import * as pvutils from 'pvutils';
import { IndexedDBStore, StoredKeyData } from './IndexedDBStore';

// Set crypto engine for PKI.js
const cryptoEngine = new pkijs.CryptoEngine({
  name: 'webcrypto',
  crypto: crypto,
  subtle: crypto.subtle,
});
pkijs.setEngine('webcrypto', crypto, cryptoEngine);

export type AlgorithmType = 'RSA-2048' | 'RSA-4096' | 'ECDSA-P256';

export interface CertificateDetails {
  commonName: string;
  organization?: string;
  organizationalUnit?: string;
  country?: string;
  email?: string;
  validityYears: number;
}

export interface SigningKey {
  id: string;
  name: string;
  algorithm: AlgorithmType;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  certificate: pkijs.Certificate;
  certificatePem: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface StoredSigningKey {
  id: string;
  name: string;
  algorithm: string;
  certificatePem: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Get algorithm parameters for WebCrypto key generation
 */
function getAlgorithmParams(algorithm: AlgorithmType): RsaHashedKeyGenParams | EcKeyGenParams {
  switch (algorithm) {
    case 'RSA-2048':
      return {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      };
    case 'RSA-4096':
      return {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      };
    case 'ECDSA-P256':
      return {
        name: 'ECDSA',
        namedCurve: 'P-256',
      };
    default:
      throw new Error(`Unsupported algorithm: ${algorithm}`);
  }
}

/**
 * Get signature algorithm OID for certificate
 */
function getSignatureAlgorithmOID(algorithm: AlgorithmType): string {
  switch (algorithm) {
    case 'RSA-2048':
    case 'RSA-4096':
      return '1.2.840.113549.1.1.11'; // sha256WithRSAEncryption
    case 'ECDSA-P256':
      return '1.2.840.10045.4.3.2'; // ecdsa-with-SHA256
    default:
      throw new Error(`Unsupported algorithm: ${algorithm}`);
  }
}

/**
 * Convert a certificate to PEM format
 */
function certificateToPem(certificate: pkijs.Certificate): string {
  const certBer = certificate.toSchema().toBER(false);
  const certBase64 = pvutils.toBase64(pvutils.arrayBufferToString(certBer));

  // Format with line breaks every 64 characters
  const lines = certBase64.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
}

/**
 * Parse PEM certificate to PKI.js Certificate
 */
function pemToCertificate(pem: string): pkijs.Certificate {
  const b64 = pem
    .replace('-----BEGIN CERTIFICATE-----', '')
    .replace('-----END CERTIFICATE-----', '')
    .replace(/\s/g, '');

  const der = pvutils.stringToArrayBuffer(pvutils.fromBase64(b64));
  const asn1 = asn1js.fromBER(der);

  if (asn1.offset === -1) {
    throw new Error('Invalid certificate format');
  }

  return new pkijs.Certificate({ schema: asn1.result });
}

/**
 * Generate a unique ID for a key
 */
function generateKeyId(): string {
  return `key-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Key Manager class for handling signing keys
 */
export const KeyManager = {
  /**
   * Generate a new signing key with a self-signed certificate
   */
  async generateKey(
    name: string,
    algorithm: AlgorithmType,
    certDetails: CertificateDetails,
    password: string
  ): Promise<SigningKey> {
    // Generate key pair
    const algorithmParams = getAlgorithmParams(algorithm);
    const keyPair = await crypto.subtle.generateKey(
      algorithmParams,
      true, // extractable
      ['sign', 'verify']
    );

    const privateKey = keyPair.privateKey;
    const publicKey = keyPair.publicKey;

    // Create self-signed certificate
    const certificate = new pkijs.Certificate();

    // Set version (v3)
    certificate.version = 2;

    // Set serial number
    certificate.serialNumber = new asn1js.Integer({ value: Date.now() });

    // Set issuer (self-signed, so issuer = subject)
    const issuerTypesAndValues = [];

    if (certDetails.country) {
      issuerTypesAndValues.push(new pkijs.AttributeTypeAndValue({
        type: '2.5.4.6', // countryName
        value: new asn1js.PrintableString({ value: certDetails.country }),
      }));
    }

    if (certDetails.organization) {
      issuerTypesAndValues.push(new pkijs.AttributeTypeAndValue({
        type: '2.5.4.10', // organizationName
        value: new asn1js.Utf8String({ value: certDetails.organization }),
      }));
    }

    if (certDetails.organizationalUnit) {
      issuerTypesAndValues.push(new pkijs.AttributeTypeAndValue({
        type: '2.5.4.11', // organizationalUnitName
        value: new asn1js.Utf8String({ value: certDetails.organizationalUnit }),
      }));
    }

    issuerTypesAndValues.push(new pkijs.AttributeTypeAndValue({
      type: '2.5.4.3', // commonName
      value: new asn1js.Utf8String({ value: certDetails.commonName }),
    }));

    if (certDetails.email) {
      issuerTypesAndValues.push(new pkijs.AttributeTypeAndValue({
        type: '1.2.840.113549.1.9.1', // emailAddress
        value: new asn1js.IA5String({ value: certDetails.email }),
      }));
    }

    certificate.issuer.typesAndValues = issuerTypesAndValues;
    certificate.subject.typesAndValues = issuerTypesAndValues;

    // Set validity period
    const notBefore = new Date();
    const notAfter = new Date();
    notAfter.setFullYear(notAfter.getFullYear() + certDetails.validityYears);

    certificate.notBefore.value = notBefore;
    certificate.notAfter.value = notAfter;

    // Set signature algorithm
    certificate.signatureAlgorithm.algorithmId = getSignatureAlgorithmOID(algorithm);

    // Import public key to certificate
    await certificate.subjectPublicKeyInfo.importKey(publicKey);

    // Add extensions
    certificate.extensions = [];

    // Basic Constraints (CA: false)
    const basicConstraints = new pkijs.BasicConstraints({
      cA: false,
    });
    certificate.extensions.push(new pkijs.Extension({
      extnID: '2.5.29.19',
      critical: true,
      extnValue: basicConstraints.toSchema().toBER(false),
    }));

    // Key Usage (Digital Signature, Non-Repudiation)
    const keyUsageBits = new ArrayBuffer(1);
    const keyUsageView = new Uint8Array(keyUsageBits);
    keyUsageView[0] = 0xC0; // digitalSignature (0) + nonRepudiation (1)

    certificate.extensions.push(new pkijs.Extension({
      extnID: '2.5.29.15',
      critical: true,
      extnValue: new asn1js.BitString({ valueHex: keyUsageBits }).toBER(false),
    }));

    // Sign the certificate
    await certificate.sign(privateKey, 'SHA-256');

    const certificatePem = certificateToPem(certificate);
    const id = generateKeyId();

    // Export private key as JWK and store in IndexedDB
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', privateKey);

    await IndexedDBStore.saveKey(
      id,
      name,
      algorithm,
      privateKeyJwk,
      certificatePem,
      notBefore,
      notAfter,
      password
    );

    return {
      id,
      name,
      algorithm,
      privateKey,
      publicKey,
      certificate,
      certificatePem,
      createdAt: notBefore,
      expiresAt: notAfter,
    };
  },

  /**
   * List all stored keys (without private key data)
   */
  async listKeys(): Promise<StoredSigningKey[]> {
    const keys = await IndexedDBStore.listKeys();
    return keys.map(k => ({
      id: k.id,
      name: k.name,
      algorithm: k.algorithm,
      certificatePem: k.certificate,
      createdAt: new Date(k.createdAt),
      expiresAt: new Date(k.expiresAt),
    }));
  },

  /**
   * Get a key with its decrypted private key
   */
  async getKey(id: string, password: string): Promise<SigningKey | null> {
    const keyData = await IndexedDBStore.getKey(id, password);
    if (!keyData) return null;

    // Parse certificate
    const certificate = pemToCertificate(keyData.certificate);

    // Import private key
    const algorithmParams = getAlgorithmParams(keyData.algorithm as AlgorithmType);
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      keyData.privateKeyJwk,
      algorithmParams,
      true,
      ['sign']
    );

    // Extract public key from certificate
    const publicKey = await certificate.subjectPublicKeyInfo.exportKey(crypto);

    // Get dates from certificate
    const createdAt = certificate.notBefore.value;
    const expiresAt = certificate.notAfter.value;

    return {
      id,
      name: keyData.name,
      algorithm: keyData.algorithm as AlgorithmType,
      privateKey,
      publicKey: publicKey as CryptoKey,
      certificate,
      certificatePem: keyData.certificate,
      createdAt,
      expiresAt,
    };
  },

  /**
   * Delete a key
   */
  async deleteKey(id: string): Promise<void> {
    await IndexedDBStore.deleteKey(id);
  },

  /**
   * Export a key as PKCS#12 (.p12) file
   */
  async exportP12(id: string, password: string, exportPassword: string): Promise<Blob> {
    const key = await this.getKey(id, password);
    if (!key) {
      throw new Error('Key not found or invalid password');
    }

    // Create PKCS#12 structure
    const pkcs12 = new pkijs.PFX({
      parsedValue: {
        integrityMode: 0, // Password-based integrity
        authenticatedSafe: new pkijs.AuthenticatedSafe({
          parsedValue: {
            safeContents: [],
          },
        }),
      },
    });

    // Create SafeBag for certificate
    const certSafeBag = new pkijs.SafeBag({
      bagId: '1.2.840.113549.1.12.10.1.3', // certBag
      bagValue: new pkijs.CertBag({
        parsedValue: key.certificate,
      }),
    });

    // Create SafeContents for certificate (unencrypted)
    const certSafeContents = new pkijs.SafeContents({
      safeBags: [certSafeBag],
    });

    // Export private key for PKCS#8
    const privateKeyPkcs8 = await crypto.subtle.exportKey('pkcs8', key.privateKey);

    // Create SafeBag for private key
    const keySafeBag = new pkijs.SafeBag({
      bagId: '1.2.840.113549.1.12.10.1.2', // pkcs8ShroudedKeyBag
      bagValue: new pkijs.PKCS8ShroudedKeyBag({
        parsedValue: pkijs.PrivateKeyInfo.fromBER(privateKeyPkcs8),
      }),
    });

    // Encrypt the key bag
    await keySafeBag.bagValue.makeInternalValues({
      password: pvutils.stringToArrayBuffer(exportPassword),
      contentEncryptionAlgorithm: {
        name: 'AES-CBC',
        length: 256,
      },
      hmacHashAlgorithm: 'SHA-256',
      iterationCount: 100000,
    });

    // Create SafeContents for private key (encrypted)
    const keySafeContents = new pkijs.SafeContents({
      safeBags: [keySafeBag],
    });

    // Add to authenticated safe
    pkcs12.parsedValue!.authenticatedSafe!.parsedValue!.safeContents = [
      {
        privacyMode: 0, // no privacy (cert is public)
        value: certSafeContents,
      },
      {
        privacyMode: 1, // password-based privacy
        value: keySafeContents,
      },
    ];

    // Encode the authenticated safe
    await pkcs12.parsedValue!.authenticatedSafe!.makeInternalValues({
      safeContents: [
        {}, // No encryption for cert
        {
          password: pvutils.stringToArrayBuffer(exportPassword),
          contentEncryptionAlgorithm: {
            name: 'AES-CBC',
            length: 256,
          },
          hmacHashAlgorithm: 'SHA-256',
          iterationCount: 100000,
        },
      ],
    });

    // Add MAC for integrity
    await pkcs12.makeInternalValues({
      password: pvutils.stringToArrayBuffer(exportPassword),
      iterations: 100000,
      pbkdf2HashAlgorithm: 'SHA-256',
      hmacHashAlgorithm: 'SHA-256',
    });

    // Encode to DER
    const pkcs12Der = pkcs12.toSchema().toBER(false);

    return new Blob([pkcs12Der], { type: 'application/x-pkcs12' });
  },

  /**
   * Import a key from PKCS#12 (.p12) file
   */
  async importP12(file: File, filePassword: string, storePassword: string, name?: string): Promise<SigningKey> {
    const arrayBuffer = await file.arrayBuffer();
    const asn1 = asn1js.fromBER(arrayBuffer);

    if (asn1.offset === -1) {
      throw new Error('Invalid PKCS#12 file format');
    }

    const pkcs12 = new pkijs.PFX({ schema: asn1.result });

    // Parse the PKCS#12
    await pkcs12.parseInternalValues({
      password: pvutils.stringToArrayBuffer(filePassword),
    });

    // Extract certificate and private key
    let certificate: pkijs.Certificate | null = null;
    let privateKeyInfo: pkijs.PrivateKeyInfo | null = null;

    const authenticatedSafe = pkcs12.parsedValue?.authenticatedSafe;
    if (!authenticatedSafe?.parsedValue?.safeContents) {
      throw new Error('Invalid PKCS#12 structure');
    }

    for (const safeContent of authenticatedSafe.parsedValue.safeContents) {
      if (!safeContent.value?.safeBags) continue;

      for (const safeBag of safeContent.value.safeBags) {
        if (safeBag.bagId === '1.2.840.113549.1.12.10.1.3') {
          // certBag
          const certBag = safeBag.bagValue as pkijs.CertBag;
          if (certBag.parsedValue instanceof pkijs.Certificate) {
            certificate = certBag.parsedValue;
          }
        } else if (safeBag.bagId === '1.2.840.113549.1.12.10.1.2') {
          // pkcs8ShroudedKeyBag
          const keyBag = safeBag.bagValue as pkijs.PKCS8ShroudedKeyBag;
          await keyBag.parseInternalValues({
            password: pvutils.stringToArrayBuffer(filePassword),
          });
          privateKeyInfo = keyBag.parsedValue;
        } else if (safeBag.bagId === '1.2.840.113549.1.12.10.1.1') {
          // keyBag (unencrypted)
          privateKeyInfo = safeBag.bagValue as pkijs.PrivateKeyInfo;
        }
      }
    }

    if (!certificate) {
      throw new Error('No certificate found in PKCS#12 file');
    }

    if (!privateKeyInfo) {
      throw new Error('No private key found in PKCS#12 file');
    }

    // Determine algorithm from certificate
    const publicKeyAlgorithm = certificate.subjectPublicKeyInfo.algorithm.algorithmId;
    let algorithm: AlgorithmType;
    let importAlgorithm: RsaHashedImportParams | EcKeyImportParams;

    if (publicKeyAlgorithm === '1.2.840.113549.1.1.1') {
      // RSA
      const modulus = (certificate.subjectPublicKeyInfo.parsedKey as pkijs.RSAPublicKey).modulus;
      const keySize = modulus.valueBlock.valueHexView.length * 8;
      algorithm = keySize >= 4096 ? 'RSA-4096' : 'RSA-2048';
      importAlgorithm = {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      };
    } else if (publicKeyAlgorithm === '1.2.840.10045.2.1') {
      // ECDSA
      algorithm = 'ECDSA-P256';
      importAlgorithm = {
        name: 'ECDSA',
        namedCurve: 'P-256',
      };
    } else {
      throw new Error('Unsupported key algorithm');
    }

    // Import private key
    const privateKeyDer = privateKeyInfo.toSchema().toBER(false);
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyDer,
      importAlgorithm,
      true,
      ['sign']
    );

    // Extract public key
    const publicKey = await certificate.subjectPublicKeyInfo.exportKey(crypto);

    const certificatePem = certificateToPem(certificate);
    const id = generateKeyId();
    const keyName = name || `Imported Key ${new Date().toLocaleDateString()}`;

    // Store in IndexedDB
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', privateKey);

    await IndexedDBStore.saveKey(
      id,
      keyName,
      algorithm,
      privateKeyJwk,
      certificatePem,
      certificate.notBefore.value,
      certificate.notAfter.value,
      storePassword
    );

    return {
      id,
      name: keyName,
      algorithm,
      privateKey,
      publicKey: publicKey as CryptoKey,
      certificate,
      certificatePem,
      createdAt: certificate.notBefore.value,
      expiresAt: certificate.notAfter.value,
    };
  },

  /**
   * Check if any keys exist
   */
  async hasKeys(): Promise<boolean> {
    return IndexedDBStore.hasKeys();
  },

  /**
   * Clear all keys (for logout)
   */
  async clearAll(): Promise<void> {
    return IndexedDBStore.clearAll();
  },

  /**
   * Parse certificate details from PEM
   */
  parseCertificateDetails(pem: string): {
    commonName?: string;
    organization?: string;
    email?: string;
    validFrom: Date;
    validTo: Date;
    issuer: string;
    subject: string;
  } {
    const certificate = pemToCertificate(pem);

    const getAttributeValue = (typesAndValues: pkijs.AttributeTypeAndValue[], oid: string): string | undefined => {
      const attr = typesAndValues.find(tv => tv.type === oid);
      if (attr && attr.value) {
        return (attr.value as asn1js.Utf8String | asn1js.PrintableString | asn1js.IA5String).valueBlock?.value;
      }
      return undefined;
    };

    const formatDN = (typesAndValues: pkijs.AttributeTypeAndValue[]): string => {
      const parts: string[] = [];
      const cn = getAttributeValue(typesAndValues, '2.5.4.3');
      const o = getAttributeValue(typesAndValues, '2.5.4.10');
      const ou = getAttributeValue(typesAndValues, '2.5.4.11');
      const c = getAttributeValue(typesAndValues, '2.5.4.6');
      const email = getAttributeValue(typesAndValues, '1.2.840.113549.1.9.1');

      if (cn) parts.push(`CN=${cn}`);
      if (o) parts.push(`O=${o}`);
      if (ou) parts.push(`OU=${ou}`);
      if (c) parts.push(`C=${c}`);
      if (email) parts.push(`E=${email}`);

      return parts.join(', ');
    };

    return {
      commonName: getAttributeValue(certificate.subject.typesAndValues, '2.5.4.3'),
      organization: getAttributeValue(certificate.subject.typesAndValues, '2.5.4.10'),
      email: getAttributeValue(certificate.subject.typesAndValues, '1.2.840.113549.1.9.1'),
      validFrom: certificate.notBefore.value,
      validTo: certificate.notAfter.value,
      issuer: formatDN(certificate.issuer.typesAndValues),
      subject: formatDN(certificate.subject.typesAndValues),
    };
  },
};
