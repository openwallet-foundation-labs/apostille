/**
 * PDF Signer for client-side PDF signing
 *
 * Uses pdf-lib for PDF manipulation and PKI.js for PKCS#7/CMS signatures
 */

import { PDFDocument, PDFName, PDFHexString, PDFString, PDFArray, PDFNumber, PDFDict, PDFRef } from 'pdf-lib';
import * as pkijs from 'pkijs';
import * as asn1js from 'asn1js';
import * as pvutils from 'pvutils';
import { SigningKey } from './KeyManager';

// Ensure crypto engine is set for PKI.js
const cryptoEngine = new pkijs.CryptoEngine({
  name: 'webcrypto',
  crypto: crypto,
  subtle: crypto.subtle,
});
pkijs.setEngine('webcrypto', crypto, cryptoEngine);

export interface SignOptions {
  reason?: string;
  location?: string;
  contactInfo?: string;
  signatureFieldName?: string;
}

export interface SignatureInfo {
  signerName: string;
  reason?: string;
  location?: string;
  signingTime: Date;
  certificate: {
    subject: string;
    issuer: string;
    validFrom: Date;
    validTo: Date;
  };
  isValid: boolean;
  validationMessage: string;
}

// Placeholder size for signature (must be large enough for the PKCS#7 data)
const SIGNATURE_PLACEHOLDER_SIZE = 8192;

/**
 * Convert a certificate PEM to DER
 */
function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace('-----BEGIN CERTIFICATE-----', '')
    .replace('-----END CERTIFICATE-----', '')
    .replace(/\s/g, '');
  return pvutils.stringToArrayBuffer(pvutils.fromBase64(b64));
}

/**
 * Create a PKCS#7 SignedData structure
 */
async function createPkcs7SignedData(
  dataToSign: Uint8Array,
  privateKey: CryptoKey,
  certificate: pkijs.Certificate,
  algorithm: string
): Promise<ArrayBuffer> {
  // Create ContentInfo with SignedData
  const cmsSigned = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({
      eContentType: '1.2.840.113549.1.7.1', // data
      // eContent is omitted for detached signature
    }),
    signerInfos: [
      new pkijs.SignerInfo({
        version: 1,
        sid: new pkijs.IssuerAndSerialNumber({
          issuer: certificate.issuer,
          serialNumber: certificate.serialNumber,
        }),
      }),
    ],
    certificates: [certificate],
  });

  // Set digest algorithm
  const hashAlgorithm = 'SHA-256';
  const hashOid = '2.16.840.1.101.3.4.2.1'; // SHA-256

  cmsSigned.digestAlgorithms = [
    new pkijs.AlgorithmIdentifier({
      algorithmId: hashOid,
    }),
  ];

  cmsSigned.signerInfos[0].digestAlgorithm = new pkijs.AlgorithmIdentifier({
    algorithmId: hashOid,
  });

  // Set signature algorithm
  if (algorithm.startsWith('RSA')) {
    cmsSigned.signerInfos[0].signatureAlgorithm = new pkijs.AlgorithmIdentifier({
      algorithmId: '1.2.840.113549.1.1.11', // sha256WithRSAEncryption
    });
  } else {
    cmsSigned.signerInfos[0].signatureAlgorithm = new pkijs.AlgorithmIdentifier({
      algorithmId: '1.2.840.10045.4.3.2', // ecdsa-with-SHA256
    });
  }

  // Create signed attributes
  const signingTime = new Date();

  cmsSigned.signerInfos[0].signedAttrs = new pkijs.SignedAndUnsignedAttributes({
    type: 0, // signedAttrs
    attributes: [
      // Content type
      new pkijs.Attribute({
        type: '1.2.840.113549.1.9.3',
        values: [new asn1js.ObjectIdentifier({ value: '1.2.840.113549.1.7.1' })],
      }),
      // Signing time
      new pkijs.Attribute({
        type: '1.2.840.113549.1.9.5',
        values: [new asn1js.UTCTime({ valueDate: signingTime })],
      }),
      // Message digest (will be calculated)
      new pkijs.Attribute({
        type: '1.2.840.113549.1.9.4',
        values: [new asn1js.OctetString({ valueHex: new ArrayBuffer(0) })], // Placeholder
      }),
    ],
  });

  // Calculate message digest (convert Uint8Array to ArrayBuffer for TypeScript compatibility)
  const dataBuffer = dataToSign.buffer.slice(dataToSign.byteOffset, dataToSign.byteOffset + dataToSign.byteLength) as ArrayBuffer;
  const hashBuffer = await crypto.subtle.digest(hashAlgorithm, dataBuffer);

  // Update message digest attribute
  cmsSigned.signerInfos[0].signedAttrs!.attributes[2].values = [
    new asn1js.OctetString({ valueHex: hashBuffer }),
  ];

  // Sign the signed attributes
  const signedAttrsData = cmsSigned.signerInfos[0].signedAttrs!.toSchema().toBER(false);

  let signature: ArrayBuffer;
  if (algorithm.startsWith('RSA')) {
    signature = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      privateKey,
      signedAttrsData
    );
  } else {
    // ECDSA
    signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      signedAttrsData
    );

    // Convert WebCrypto ECDSA signature (r||s) to ASN.1 format
    const r = new Uint8Array(signature.slice(0, 32));
    const s = new Uint8Array(signature.slice(32));

    const ecdsaSig = new asn1js.Sequence({
      value: [
        new asn1js.Integer({ valueHex: r.buffer }),
        new asn1js.Integer({ valueHex: s.buffer }),
      ],
    });

    signature = ecdsaSig.toBER(false);
  }

  cmsSigned.signerInfos[0].signature = new asn1js.OctetString({ valueHex: signature });

  // Create ContentInfo wrapper
  const contentInfo = new pkijs.ContentInfo({
    contentType: '1.2.840.113549.1.7.2', // signedData
    content: cmsSigned.toSchema(true),
  });

  return contentInfo.toSchema().toBER(false);
}

/**
 * Find the byte ranges in a PDF that need to be signed
 * Returns the ranges excluding the signature contents
 */
function findByteRanges(pdfBytes: Uint8Array, signatureContentsOffset: number, signatureLength: number): number[] {
  // ByteRange format: [offset1, length1, offset2, length2]
  // offset1 = 0, length1 = bytes before signature contents
  // offset2 = bytes after signature contents start, length2 = remaining bytes
  return [
    0,
    signatureContentsOffset,
    signatureContentsOffset + signatureLength,
    pdfBytes.length - (signatureContentsOffset + signatureLength),
  ];
}

/**
 * PdfSigner class for signing PDF documents
 */
export const PdfSigner = {
  /**
   * Sign a PDF document with a signing key
   */
  async signPdf(
    pdfBytes: Uint8Array,
    signingKey: SigningKey,
    options: SignOptions = {}
  ): Promise<Uint8Array> {
    // Load the PDF
    const pdfDoc = await PDFDocument.load(pdfBytes, {
      updateMetadata: false,
    });

    // Get the PDF context
    const context = pdfDoc.context;

    // Create signature dictionary
    const signatureDict = context.obj({
      Type: PDFName.of('Sig'),
      Filter: PDFName.of('Adobe.PPKLite'),
      SubFilter: PDFName.of('adbe.pkcs7.detached'),
      ByteRange: PDFArray.withContext(context), // Will be updated later
      Contents: PDFHexString.of('0'.repeat(SIGNATURE_PLACEHOLDER_SIZE * 2)), // Placeholder
      Reason: options.reason ? PDFString.of(options.reason) : undefined,
      Location: options.location ? PDFString.of(options.location) : undefined,
      ContactInfo: options.contactInfo ? PDFString.of(options.contactInfo) : undefined,
      M: PDFString.of(formatPdfDate(new Date())),
      Name: PDFString.of(signingKey.name),
    });

    const signatureDictRef = context.register(signatureDict);

    // Create signature field
    const signatureFieldDict = context.obj({
      FT: PDFName.of('Sig'),
      T: PDFString.of(options.signatureFieldName || 'Signature1'),
      V: signatureDictRef,
      Ff: PDFNumber.of(0),
    });

    const signatureFieldRef = context.register(signatureFieldDict);

    // Get or create AcroForm
    const catalog = pdfDoc.catalog;
    let acroForm = catalog.lookup(PDFName.of('AcroForm')) as PDFDict | undefined;

    if (!acroForm) {
      acroForm = context.obj({
        Fields: PDFArray.withContext(context),
        SigFlags: PDFNumber.of(3), // SignaturesExist + AppendOnly
      });
      catalog.set(PDFName.of('AcroForm'), acroForm);
    } else {
      // Make sure SigFlags is set
      if (!acroForm.has(PDFName.of('SigFlags'))) {
        acroForm.set(PDFName.of('SigFlags'), PDFNumber.of(3));
      }
    }

    // Add signature field to Fields array
    let fields = acroForm.lookup(PDFName.of('Fields')) as PDFArray | undefined;
    if (!fields) {
      fields = PDFArray.withContext(context);
      acroForm.set(PDFName.of('Fields'), fields);
    }
    fields.push(signatureFieldRef);

    // Save the PDF without signature to find the placeholder position
    let savedPdf = await pdfDoc.save({ useObjectStreams: false });

    // Find the Contents placeholder position
    const pdfString = new TextDecoder('latin1').decode(savedPdf);
    const contentsMatch = pdfString.match(/\/Contents\s*<([0]+)>/);

    if (!contentsMatch) {
      throw new Error('Could not find signature placeholder in PDF');
    }

    const contentsStart = pdfString.indexOf(contentsMatch[0]) + '/Contents '.length;
    const contentsHexStart = contentsStart + 1; // After '<'
    const contentsHexEnd = contentsHexStart + SIGNATURE_PLACEHOLDER_SIZE * 2;

    // Calculate byte ranges
    const byteRanges = findByteRanges(savedPdf, contentsHexStart, SIGNATURE_PLACEHOLDER_SIZE * 2 + 2);

    // Update ByteRange in the PDF
    const byteRangeArray = context.obj([
      PDFNumber.of(byteRanges[0]),
      PDFNumber.of(byteRanges[1]),
      PDFNumber.of(byteRanges[2]),
      PDFNumber.of(byteRanges[3]),
    ]);

    signatureDict.set(PDFName.of('ByteRange'), byteRangeArray);

    // Re-save to update ByteRange
    savedPdf = await pdfDoc.save({ useObjectStreams: false });

    // Extract the bytes to sign (excluding signature contents)
    const bytesToSign = new Uint8Array(byteRanges[1] + byteRanges[3]);
    bytesToSign.set(savedPdf.slice(byteRanges[0], byteRanges[0] + byteRanges[1]), 0);
    bytesToSign.set(savedPdf.slice(byteRanges[2], byteRanges[2] + byteRanges[3]), byteRanges[1]);

    // Create PKCS#7 signature
    const pkcs7Der = await createPkcs7SignedData(
      bytesToSign,
      signingKey.privateKey,
      signingKey.certificate,
      signingKey.algorithm
    );

    // Convert to hex string
    const pkcs7Hex = Array.from(new Uint8Array(pkcs7Der))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();

    if (pkcs7Hex.length > SIGNATURE_PLACEHOLDER_SIZE * 2) {
      throw new Error('Signature is too large for placeholder');
    }

    // Pad to placeholder size
    const paddedSignature = pkcs7Hex.padEnd(SIGNATURE_PLACEHOLDER_SIZE * 2, '0');

    // Create final PDF with embedded signature
    const finalPdf = new Uint8Array(savedPdf.length);
    finalPdf.set(savedPdf);

    // Find and replace the placeholder
    const pdfStr = new TextDecoder('latin1').decode(finalPdf);
    const placeholderMatch = pdfStr.match(/\/Contents\s*<([0]+)>/);

    if (placeholderMatch) {
      const placeholderStart = pdfStr.indexOf('<' + placeholderMatch[1] + '>') + 1;
      const encoder = new TextEncoder();
      const signatureBytes = encoder.encode(paddedSignature);

      for (let i = 0; i < signatureBytes.length; i++) {
        finalPdf[placeholderStart + i] = signatureBytes[i];
      }
    }

    return finalPdf;
  },

  /**
   * Verify a PDF signature
   */
  async verifySignature(pdfBytes: Uint8Array): Promise<SignatureInfo | null> {
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const catalog = pdfDoc.catalog;

      const acroForm = catalog.lookup(PDFName.of('AcroForm')) as PDFDict | undefined;
      if (!acroForm) {
        return null;
      }

      const fields = acroForm.lookup(PDFName.of('Fields')) as PDFArray | undefined;
      if (!fields) {
        return null;
      }

      // Find signature field
      for (let i = 0; i < fields.size(); i++) {
        const fieldRef = fields.get(i) as PDFRef;
        const field = pdfDoc.context.lookup(fieldRef) as PDFDict;

        const ft = field.lookup(PDFName.of('FT'));
        if (ft && (ft as PDFName).asString() === '/Sig') {
          const sigDict = field.lookup(PDFName.of('V')) as PDFDict;
          if (!sigDict) continue;

          // Extract signature info
          const contentsObj = sigDict.lookup(PDFName.of('Contents'));
          if (!contentsObj) continue;

          const contents = (contentsObj as PDFHexString).asBytes();

          // Parse PKCS#7 (convert to ArrayBuffer for TypeScript compatibility)
          const contentsBuffer = contents.buffer.slice(contents.byteOffset, contents.byteOffset + contents.byteLength) as ArrayBuffer;
          const asn1 = asn1js.fromBER(contentsBuffer);
          if (asn1.offset === -1) {
            return {
              signerName: 'Unknown',
              signingTime: new Date(),
              certificate: {
                subject: 'Unknown',
                issuer: 'Unknown',
                validFrom: new Date(),
                validTo: new Date(),
              },
              isValid: false,
              validationMessage: 'Invalid PKCS#7 structure',
            };
          }

          const contentInfo = new pkijs.ContentInfo({ schema: asn1.result });
          const signedData = new pkijs.SignedData({ schema: contentInfo.content });

          // Extract certificate
          const cert = signedData.certificates?.[0] as pkijs.Certificate;
          if (!cert) {
            return {
              signerName: 'Unknown',
              signingTime: new Date(),
              certificate: {
                subject: 'Unknown',
                issuer: 'Unknown',
                validFrom: new Date(),
                validTo: new Date(),
              },
              isValid: false,
              validationMessage: 'No certificate in signature',
            };
          }

          // Get signer name from certificate
          const getCommonName = (typesAndValues: pkijs.AttributeTypeAndValue[]): string => {
            const cn = typesAndValues.find(tv => tv.type === '2.5.4.3');
            if (cn && cn.value) {
              return (cn.value as asn1js.Utf8String).valueBlock?.value || 'Unknown';
            }
            return 'Unknown';
          };

          const formatDN = (typesAndValues: pkijs.AttributeTypeAndValue[]): string => {
            const parts: string[] = [];
            for (const tv of typesAndValues) {
              const value = (tv.value as asn1js.Utf8String | asn1js.PrintableString).valueBlock?.value;
              if (value) {
                if (tv.type === '2.5.4.3') parts.push(`CN=${value}`);
                else if (tv.type === '2.5.4.10') parts.push(`O=${value}`);
                else if (tv.type === '2.5.4.6') parts.push(`C=${value}`);
              }
            }
            return parts.join(', ');
          };

          // Get signing time from signed attributes
          let signingTime = new Date();
          const signerInfo = signedData.signerInfos[0];
          if (signerInfo.signedAttrs) {
            const sigTimeAttr = signerInfo.signedAttrs.attributes.find(
              attr => attr.type === '1.2.840.113549.1.9.5'
            );
            if (sigTimeAttr && sigTimeAttr.values[0]) {
              signingTime = (sigTimeAttr.values[0] as asn1js.UTCTime).toDate();
            }
          }

          // Get reason and location
          const reasonObj = sigDict.lookup(PDFName.of('Reason'));
          const locationObj = sigDict.lookup(PDFName.of('Location'));

          return {
            signerName: getCommonName(cert.subject.typesAndValues),
            reason: reasonObj ? (reasonObj as PDFString).asString() : undefined,
            location: locationObj ? (locationObj as PDFString).asString() : undefined,
            signingTime,
            certificate: {
              subject: formatDN(cert.subject.typesAndValues),
              issuer: formatDN(cert.issuer.typesAndValues),
              validFrom: cert.notBefore.value,
              validTo: cert.notAfter.value,
            },
            isValid: true, // Basic validation - for full validation would need to verify the hash
            validationMessage: 'Signature structure is valid (self-signed certificate)',
          };
        }
      }

      return null;
    } catch (error) {
      return {
        signerName: 'Unknown',
        signingTime: new Date(),
        certificate: {
          subject: 'Unknown',
          issuer: 'Unknown',
          validFrom: new Date(),
          validTo: new Date(),
        },
        isValid: false,
        validationMessage: `Error parsing signature: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Format a date for PDF date string format
 */
function formatPdfDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  const offset = -date.getTimezoneOffset();
  const offsetSign = offset >= 0 ? '+' : '-';
  const offsetHours = pad(Math.floor(Math.abs(offset) / 60));
  const offsetMinutes = pad(Math.abs(offset) % 60);

  return `D:${year}${month}${day}${hours}${minutes}${seconds}${offsetSign}${offsetHours}'${offsetMinutes}'`;
}
