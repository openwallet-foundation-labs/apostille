/**
 * Signature Stamper — embeds visual signature images into PDF pages
 *
 * Runs BEFORE the PKCS#7 cryptographic signing step so the visual
 * stamp becomes part of the signed content.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import type { SigningField } from '../../app/components/pdf-signing/types'

/**
 * Convert a data URL (e.g. "data:image/png;base64,...") to Uint8Array
 */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Stamp signature images and field values onto the PDF.
 *
 * @param pdfBytes   - Original PDF bytes
 * @param fields     - Signing fields placed by the owner
 * @param completions - Map of fieldId → data URL (signature/initials) or string (date/name)
 * @param signerName - Signer's name (used for "name" type fields)
 * @returns Modified PDF bytes with visible annotations
 */
export async function stampSignaturesOnPdf(
  pdfBytes: Uint8Array,
  fields: SigningField[],
  completions: Record<string, string>, // fieldId → dataUrl or text
  signerName: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const pages = pdfDoc.getPages()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  for (const field of fields) {
    const completion = completions[field.id]
    if (!completion) continue

    const pdfPage = pages[field.page]
    if (!pdfPage) continue

    const { width: pageWidth, height: pageHeight } = pdfPage.getSize()

    // Convert percentage coords to absolute
    const x = (field.x / 100) * pageWidth
    const w = (field.width / 100) * pageWidth
    const h = (field.height / 100) * pageHeight
    // PDF y-axis is bottom-up; field.y is top-down percentage
    const y = pageHeight - (field.y / 100) * pageHeight - h

    if (field.type === 'signature' || field.type === 'initials') {
      // Embed signature/initials image
      try {
        const imgBytes = dataUrlToBytes(completion)
        const img = await pdfDoc.embedPng(imgBytes)
        const imgDims = img.scaleToFit(w, h)
        // Center the image within the field box
        const imgX = x + (w - imgDims.width) / 2
        const imgY = y + (h - imgDims.height) / 2
        pdfPage.drawImage(img, {
          x: imgX,
          y: imgY,
          width: imgDims.width,
          height: imgDims.height,
        })
      } catch (err) {
        console.error(`Failed to stamp ${field.type} field ${field.id}:`, err)
      }
    } else if (field.type === 'date') {
      const dateText = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
      const fontSize = Math.min(h * 0.6, 14)
      pdfPage.drawText(dateText, {
        x: x + 4,
        y: y + h / 2 - fontSize / 3,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      })
    } else if (field.type === 'name') {
      const fontSize = Math.min(h * 0.6, 14)
      pdfPage.drawText(signerName, {
        x: x + 4,
        y: y + h / 2 - fontSize / 3,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      })
    }
  }

  return pdfDoc.save()
}

/**
 * Render a typed signature to a PNG data URL using an offscreen canvas.
 */
export function renderTypedSignature(
  name: string,
  fontFamily: string,
  width = 400,
  height = 120
): string {
  const canvas = document.createElement('canvas')
  const dpr = window.devicePixelRatio || 1
  canvas.width = width * dpr
  canvas.height = height * dpr
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)

  // Transparent background
  ctx.clearRect(0, 0, width, height)

  // Draw signature text
  const fontSize = Math.min(height * 0.55, 48)
  ctx.font = `${fontSize}px "${fontFamily}", cursive`
  ctx.fillStyle = '#1a1a2e'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(name, width / 2, height / 2)

  return canvas.toDataURL('image/png')
}
