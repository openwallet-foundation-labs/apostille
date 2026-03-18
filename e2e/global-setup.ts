import { generateTestPdf } from './helpers/pdf-generator';

export default async function globalSetup() {
  console.log('[E2E] Generating test PDF...');
  const pdfPath = await generateTestPdf();
  console.log(`[E2E] Test PDF generated at: ${pdfPath}`);
}
