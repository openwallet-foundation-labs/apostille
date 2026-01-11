/**
 * Client-side signing module
 *
 * Exports all signing-related functionality for use in the application.
 */

export { IndexedDBStore } from './IndexedDBStore';
export type { StoredKeyData } from './IndexedDBStore';

export { KeyManager } from './KeyManager';
export type { SigningKey, StoredSigningKey, CertificateDetails, AlgorithmType } from './KeyManager';

export { PdfSigner } from './PdfSigner';
export type { SignOptions, SignatureInfo } from './PdfSigner';
