import { test, expect } from '../fixtures/auth.fixture';
import { ConnectionsPage } from '../pages/connections.page';
import { PdfSigningPage } from '../pages/pdf-signing.page';
import {
  pollUntil,
  waitForConnectionCompleted,
  waitForKemPendingRequest,
  waitForKemReady,
} from '../helpers/wait-helpers';
import * as path from 'path';

const TEST_PDF_PATH = path.resolve(
  __dirname,
  '..',
  'test-assets',
  'test-document.pdf'
);

test.describe('Full Multi-Tenant PDF Signing E2E', () => {
  test('register, connect, exchange keys, upload PDF, sign, return, verify', async ({
    tenantA,
    tenantB,
  }) => {
    // This test covers the entire multi-tenant flow — give it plenty of time
    test.setTimeout(300_000);

    // ============================================================
    // PHASE 1: Establish Connection
    // ============================================================

    const connectionsA = new ConnectionsPage(tenantA.page);
    const connectionsB = new ConnectionsPage(tenantB.page);

    // Tenant A creates an invitation
    await connectionsA.goto();
    const invitationUrl = await connectionsA.createInvitation('E2E Signing');
    expect(invitationUrl).toBeTruthy();
    expect(invitationUrl.length).toBeGreaterThan(50);

    // Tenant B accepts the invitation
    await connectionsB.goto();
    await connectionsB.acceptInvitation(invitationUrl);

    // Wait for both sides to reach "completed" state
    await waitForConnectionCompleted(tenantB.page, 60_000);
    await connectionsA.goto();
    await waitForConnectionCompleted(tenantA.page, 60_000);

    // ============================================================
    // PHASE 2: Exchange KEM Keys
    // ============================================================

    // Tenant A initiates key exchange
    await connectionsA.exchangeKeys();

    // Tenant B waits for pending request, then accepts
    await connectionsB.goto();
    await waitForKemPendingRequest(tenantB.page, 60_000);
    await connectionsB.acceptKeyExchange();

    // Verify Tenant A also sees "Ready"
    await connectionsA.goto();
    await waitForKemReady(tenantA.page, 60_000);

    // ============================================================
    // PHASE 3: Owner Uploads PDF
    // ============================================================

    const pdfSigningA = new PdfSigningPage(tenantA.page);
    await pdfSigningA.goto();

    // The connection label for Tenant B is "E2E tenant-b" (set in auth fixture)
    await pdfSigningA.uploadPdf(TEST_PDF_PATH, 'tenant-b', 'E2E test contract');

    // ============================================================
    // PHASE 4: Signer Signs the PDF
    // ============================================================

    const pdfSigningB = new PdfSigningPage(tenantB.page);
    await pdfSigningB.goto();

    // Poll until a "Sign" button appears in the signer's "Documents to Sign" section
    await pollUntil(
      tenantB.page,
      async () => {
        // Expand the collapsible section (may fail if section doesn't exist yet)
        await pdfSigningB.expandSection('Documents to Sign').catch(() => {});
        const signBtn = tenantB.page
          .locator('.card')
          .filter({ hasText: 'Documents to Sign' })
          .getByText('Sign', { exact: true })
          .first();
        return signBtn.isVisible().catch(() => false);
      },
      { timeout: 90_000, interval: 5_000, reloadBetween: true, sidebarLink: 'PDF Signing' }
    );

    // Sign the document (generates a new key + signs)
    await pdfSigningB.signPdf({
      keyName: 'E2E Signer Key',
      commonName: 'E2E Test Signer',
      keyPassword: 'SignerPass1!',
    });

    // ============================================================
    // PHASE 5: Signer Returns Signed PDF to Owner
    // ============================================================

    await pdfSigningB.goto();

    // Poll until the document appears in "Signed - Return to Owner"
    await pollUntil(
      tenantB.page,
      async () => {
        await pdfSigningB.expandSection('Signed - Return to Owner').catch(() => {});
        return tenantB.page
          .getByText('Return to Owner', { exact: true })
          .first()
          .isVisible()
          .catch(() => false);
      },
      { timeout: 60_000, interval: 5_000, reloadBetween: true, sidebarLink: 'PDF Signing' }
    );

    await pdfSigningB.returnToOwner();

    // ============================================================
    // PHASE 6: Owner Verifies Signature
    // ============================================================

    await pdfSigningA.goto();

    // Poll until the document appears with a Verify button
    await pollUntil(
      tenantA.page,
      async () => {
        await pdfSigningA.expandSection('Signed Documents').catch(() => {});
        return tenantA.page
          .locator('.card')
          .filter({ hasText: 'Signed Documents' })
          .getByText('Verify', { exact: true })
          .first()
          .isVisible()
          .catch(() => false);
      },
      { timeout: 60_000, interval: 5_000, reloadBetween: true, sidebarLink: 'PDF Signing' }
    );

    const { valid, signerName } = await pdfSigningA.verifySignature();
    expect(valid).toBe(true);
    // The signer common name should contain the name used during signing
    if (signerName) {
      expect(signerName).toContain('E2E');
    }
  });
});
