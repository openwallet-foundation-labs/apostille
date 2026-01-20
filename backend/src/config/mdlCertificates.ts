/**
 * mDL Certificate Configuration
 *
 * Manages IACA certificates for mDL/mdoc credential signing.
 * Supports both test certificates (for development) and real certificates (for production).
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import * as x509 from '@peculiar/x509'
import { cacheStores } from '../services/redis/cacheStore'

// Set crypto provider for @peculiar/x509
x509.cryptoProvider.set(crypto.webcrypto as any)

export interface MdocCertificateConfig {
  /**
   * The issuer certificate in PEM format
   * This is the certificate chain that will be included in the mdoc
   */
  issuerCertificate: string

  /**
   * The issuer private key in PEM format
   * Used for signing the mdoc MSO (Mobile Security Object)
   */
  issuerPrivateKey: string

  /**
   * The issuer private key as raw bytes (32 bytes for P-256)
   * Used for importing into Credo wallet
   */
  issuerPrivateKeyBytes: Buffer

  /**
   * The IACA (root) certificate in PEM format
   * Used by verifiers to validate the issuer certificate chain
   */
  iacaCertificate: string

  /**
   * The signing algorithm to use
   */
  algorithm: 'ES256' | 'ES384' | 'ES512'
}

/**
 * Algorithm configuration for certificate generation
 */
const ALGORITHM_CONFIG = {
  'ES256': { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' },
  'ES384': { name: 'ECDSA', namedCurve: 'P-384', hash: 'SHA-384' },
  'ES512': { name: 'ECDSA', namedCurve: 'P-521', hash: 'SHA-512' },
}

/**
 * Convert PEM format to raw bytes
 */
function pemToBytes(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '')
  return new Uint8Array(Buffer.from(base64, 'base64'))
}

/**
 * Extract raw private key bytes from PEM format
 * Uses WebCrypto to import and re-export as JWK to get the raw 'd' parameter
 */
async function extractRawPrivateKeyFromPem(pem: string): Promise<Buffer> {
  const pemBytes = pemToBytes(pem)

  // Import the PKCS8 key using WebCrypto
  const privateKey = await crypto.webcrypto.subtle.importKey(
    'pkcs8',
    pemBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign']
  )

  // Export as JWK to get the raw private key
  const jwk = await crypto.webcrypto.subtle.exportKey('jwk', privateKey) as JsonWebKey

  // The 'd' parameter is the base64url-encoded raw private key
  return Buffer.from(jwk.d!, 'base64url')
}

/**
 * Generate self-signed test certificates for development
 * Creates proper X.509 certificates using @peculiar/x509
 * WARNING: These certificates are NOT trusted by real verifiers
 */
async function generateTestCertificates(): Promise<MdocCertificateConfig> {
  console.log('[MDL] Generating test X.509 certificates for development...')

  const algorithm = 'ES256'
  const alg = ALGORITHM_CONFIG[algorithm]

  // Generate ECDSA key pair using WebCrypto
  const keyPair = await crypto.webcrypto.subtle.generateKey(
    { name: alg.name, namedCurve: alg.namedCurve },
    true, // extractable
    ['sign', 'verify']
  )

  const now = new Date()
  const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)

  // Create self-signed IACA (root) certificate
  const iacaCert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: '01',
    name: 'CN=Test IACA Root CA,O=Test Organization,C=US',
    notBefore: now,
    notAfter: oneYearFromNow,
    signingAlgorithm: { name: alg.name, hash: alg.hash },
    keys: keyPair,
    extensions: [
      new x509.BasicConstraintsExtension(true, 1, true), // CA certificate
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign,
        true
      ),
    ]
  })

  // Generate issuer key pair (different from IACA for proper chain)
  const issuerKeyPair = await crypto.webcrypto.subtle.generateKey(
    { name: alg.name, namedCurve: alg.namedCurve },
    true,
    ['sign', 'verify']
  )

  // Create issuer certificate signed by IACA
  const issuerCert = await x509.X509CertificateGenerator.create({
    serialNumber: '02',
    subject: 'CN=Test mDL Issuer,O=Test Organization,C=US',
    issuer: iacaCert.subject,
    notBefore: now,
    notAfter: oneYearFromNow,
    signingAlgorithm: { name: alg.name, hash: alg.hash },
    publicKey: issuerKeyPair.publicKey,
    signingKey: keyPair.privateKey,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true), // End entity
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.digitalSignature,
        true
      ),
      new x509.ExtendedKeyUsageExtension([
        '1.0.18013.5.1.2', // ISO 18013-5 mDL DS (Document Signer)
      ], true),
    ]
  })

  // Export private key to JWK format to extract raw private key bytes
  const issuerPrivateKeyJwk = await crypto.webcrypto.subtle.exportKey('jwk', issuerKeyPair.privateKey) as JsonWebKey

  // The 'd' parameter in JWK is the base64url-encoded raw private key
  // For P-256, this is 32 bytes
  const issuerPrivateKeyBytes = Buffer.from(issuerPrivateKeyJwk.d!, 'base64url')

  // Also export to PKCS8 for PEM format (for file storage/display)
  const issuerPrivateKeyBuffer = await crypto.webcrypto.subtle.exportKey('pkcs8', issuerKeyPair.privateKey)
  const issuerPrivateKeyPem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(issuerPrivateKeyBuffer).toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----`

  console.log('[MDL] Test X.509 certificates generated successfully')
  console.log('[MDL] WARNING: Test certificates are not trusted by real mDL verifiers')

  return {
    issuerCertificate: issuerCert.toString('pem'),
    issuerPrivateKey: issuerPrivateKeyPem,
    issuerPrivateKeyBytes,
    iacaCertificate: iacaCert.toString('pem'),
    algorithm
  }
}

/**
 * Check if certificate paths are configured
 */
function hasCertificatePaths(): boolean {
  const issuerCertPath = process.env.MDL_ISSUER_CERT_PATH
  const issuerKeyPath = process.env.MDL_ISSUER_KEY_PATH
  const iacaCertPath = process.env.MDL_IACA_CERT_PATH

  return !!(issuerCertPath && issuerKeyPath && iacaCertPath)
}

/**
 * Load certificates from file paths (for production)
 */
async function loadCertificatesFromFiles(): Promise<MdocCertificateConfig> {
  const issuerCertPath = process.env.MDL_ISSUER_CERT_PATH
  const issuerKeyPath = process.env.MDL_ISSUER_KEY_PATH
  const iacaCertPath = process.env.MDL_IACA_CERT_PATH
  const algorithm = (process.env.MDL_SIGNING_ALGORITHM || 'ES256') as 'ES256' | 'ES384' | 'ES512'

  if (!issuerCertPath || !issuerKeyPath || !iacaCertPath) {
    throw new Error(
      'Missing certificate paths. Set MDL_ISSUER_CERT_PATH, MDL_ISSUER_KEY_PATH, and MDL_IACA_CERT_PATH environment variables.'
    )
  }

  console.log('[MDL] Loading certificates from files...')
  console.log(`[MDL]   Issuer cert: ${issuerCertPath}`)
  console.log(`[MDL]   Issuer key: ${issuerKeyPath}`)
  console.log(`[MDL]   IACA cert: ${iacaCertPath}`)

  // Read certificate files (keep as PEM format)
  const issuerCertificate = fs.readFileSync(issuerCertPath, 'utf-8')
  const issuerPrivateKey = fs.readFileSync(issuerKeyPath, 'utf-8')
  const iacaCertificate = fs.readFileSync(iacaCertPath, 'utf-8')

  // Convert PEM private key to raw bytes for wallet import
  // For PEM/PKCS8 format, we need to extract just the raw private key
  const issuerPrivateKeyBytes = await extractRawPrivateKeyFromPem(issuerPrivateKey)

  console.log('[MDL] Certificates loaded successfully')

  return {
    issuerCertificate,
    issuerPrivateKey,
    issuerPrivateKeyBytes,
    iacaCertificate,
    algorithm
  }
}

// Pod-local cache for loaded certificates (reconstructed from Redis data)
let cachedConfig: MdocCertificateConfig | null = null

// Interface for Redis-serializable certificate data (without Buffer)
interface SerializableCertConfig {
  issuerCertificate: string
  issuerPrivateKey: string
  issuerPrivateKeyBase64: string // Buffer serialized as base64
  iacaCertificate: string
  algorithm: 'ES256' | 'ES384' | 'ES512'
}

/**
 * Get the mDL certificate configuration
 *
 * Priority:
 * 1. If MDL_USE_TEST_CERTIFICATES=true → use test certificates (shared via Redis)
 * 2. If certificate paths are provided → load from files
 * 3. Otherwise → fall back to test certificates (with warning)
 *
 * For multi-pod deployments, test certificates are cached in Redis to ensure
 * all pods use the same certificates.
 */
export async function getMdocCertificateConfig(): Promise<MdocCertificateConfig> {
  // Return pod-local cached config if available
  if (cachedConfig) {
    return cachedConfig
  }

  const useTestCerts = process.env.MDL_USE_TEST_CERTIFICATES === 'true'
  const hasConfiguredPaths = hasCertificatePaths()

  if (useTestCerts || !hasConfiguredPaths) {
    // Test certificates - try to get from Redis first for cross-pod consistency
    const cacheKey = 'test-certificates'
    const cached = await cacheStores.mdlCertificates.get(cacheKey) as SerializableCertConfig | null

    if (cached) {
      console.log('[MDL] Using cached test certificates from Redis')
      cachedConfig = {
        ...cached,
        issuerPrivateKeyBytes: Buffer.from(cached.issuerPrivateKeyBase64, 'base64')
      }
      return cachedConfig
    }

    // Generate new test certificates
    if (useTestCerts) {
      console.log('[MDL] Using test certificates (MDL_USE_TEST_CERTIFICATES=true)')
    } else {
      console.log('[MDL] No certificate paths configured, falling back to test certificates')
      console.log('[MDL] To use production certificates, set MDL_ISSUER_CERT_PATH, MDL_ISSUER_KEY_PATH, and MDL_IACA_CERT_PATH')
    }

    cachedConfig = await generateTestCertificates()

    // Cache in Redis for other pods (serialize Buffer to base64)
    const serializable: SerializableCertConfig = {
      issuerCertificate: cachedConfig.issuerCertificate,
      issuerPrivateKey: cachedConfig.issuerPrivateKey,
      issuerPrivateKeyBase64: cachedConfig.issuerPrivateKeyBytes.toString('base64'),
      iacaCertificate: cachedConfig.iacaCertificate,
      algorithm: cachedConfig.algorithm
    }
    await cacheStores.mdlCertificates.set(cacheKey, serializable, 86400) // 24 hours
    console.log('[MDL] Test certificates cached in Redis for cross-pod consistency')
  } else {
    // Production certificates from file paths - no need for Redis caching
    // (files should be the same across pods via ConfigMap/Secret mount)
    console.log('[MDL] Using production certificates from file paths')
    cachedConfig = await loadCertificatesFromFiles()
  }

  return cachedConfig
}

/**
 * Clear the certificate cache (useful for testing)
 * Clears both pod-local and Redis cache
 */
export async function clearCertificateCache(): Promise<void> {
  cachedConfig = null
  await cacheStores.mdlCertificates.invalidate('test-certificates')
}

/**
 * Validate that certificates are properly configured
 */
export async function validateCertificateConfig(): Promise<{
  valid: boolean
  errors: string[]
  warnings: string[]
  usingTestCertificates: boolean
}> {
  const errors: string[] = []
  const warnings: string[] = []

  const useTestCerts = process.env.MDL_USE_TEST_CERTIFICATES === 'true'
  const hasConfiguredPaths = hasCertificatePaths()
  const usingTestCertificates = useTestCerts || !hasConfiguredPaths

  try {
    const config = await getMdocCertificateConfig()

    // Check issuer certificate
    if (!config.issuerCertificate) {
      errors.push('Issuer certificate is missing')
    } else if (!config.issuerCertificate.includes('BEGIN CERTIFICATE')) {
      warnings.push('Issuer certificate may not be in PEM format')
    }

    // Check private key
    if (!config.issuerPrivateKey) {
      errors.push('Issuer private key is missing')
    } else if (!config.issuerPrivateKey.includes('BEGIN') || !config.issuerPrivateKey.includes('KEY')) {
      warnings.push('Issuer private key may not be in PEM format')
    }

    // Check IACA certificate
    if (!config.iacaCertificate) {
      errors.push('IACA certificate is missing')
    } else if (!config.iacaCertificate.includes('BEGIN CERTIFICATE')) {
      warnings.push('IACA certificate may not be in PEM format')
    }

    // Check for test certificates in production
    if (process.env.NODE_ENV === 'production' && usingTestCertificates) {
      warnings.push('Using test certificates in production environment - credentials will not be verifiable by real mDL verifiers')
    }

    // Warn if falling back to test certificates
    if (!useTestCerts && !hasConfiguredPaths) {
      warnings.push('No certificate paths configured - using auto-generated test certificates')
    }

  } catch (error: any) {
    errors.push(`Failed to load certificate configuration: ${error.message}`)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    usingTestCertificates
  }
}

/**
 * Convert a PEM certificate to base64-encoded DER format
 * Credo-TS Mdoc.sign() expects base64-encoded DER format certificates
 */
export function pemToBase64Der(pemCertificate: string): string {
  // Remove PEM headers and whitespace
  const base64Content = pemCertificate
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/-----BEGIN EC PRIVATE KEY-----/g, '')
    .replace(/-----END EC PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')

  return base64Content
}

/**
 * Get issuer certificate in the format expected by Credo-TS Mdoc.sign()
 * Returns base64-encoded DER format
 */
export async function getIssuerCertificateForSigning(): Promise<string> {
  const config = await getMdocCertificateConfig()
  return pemToBase64Der(config.issuerCertificate)
}

/**
 * Get issuer certificate for inclusion in credential metadata
 * Returns the certificate in a format suitable for display/verification
 */
export async function getIssuerCertificateInfo(): Promise<{
  subject: string
  issuer: string
  validFrom: string
  validUntil: string
  algorithm: string
  isTestCertificate: boolean
} | null> {
  try {
    const config = await getMdocCertificateConfig()

    const useTestCerts = process.env.MDL_USE_TEST_CERTIFICATES === 'true'
    const hasConfiguredPaths = hasCertificatePaths()
    const isTestCertificate = useTestCerts || !hasConfiguredPaths

    // For now, return basic info
    // In a full implementation, we would parse the X.509 certificate
    return {
      subject: 'mDL Issuer',
      issuer: isTestCertificate ? 'Test IACA (Development)' : 'Production IACA',
      validFrom: new Date().toISOString(),
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      algorithm: config.algorithm,
      isTestCertificate
    }
  } catch {
    return null
  }
}
