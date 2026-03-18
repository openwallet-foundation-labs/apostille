import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

export async function generateTestPdf(outputPath?: string): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText('E2E Test Document', {
    x: 50,
    y: 750,
    size: 24,
    font,
    color: rgb(0, 0, 0),
  });

  page.drawText(`Generated: ${new Date().toISOString()}`, {
    x: 50,
    y: 700,
    size: 12,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  page.drawText(
    'This document is used for automated E2E testing of the PDF signing workflow.',
    {
      x: 50,
      y: 660,
      size: 14,
      font,
      color: rgb(0, 0, 0),
    }
  );

  const pdfBytes = await pdfDoc.save();
  const filePath =
    outputPath ||
    path.join(__dirname, '..', 'test-assets', 'test-document.pdf');

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, pdfBytes);

  return filePath;
}
