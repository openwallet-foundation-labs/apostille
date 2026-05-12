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

    // KEM exchange is auto-accepted by the backend, so both sides
    // should reach "Ready" without manual intervention.
    await connectionsB.goto();
    await waitForKemReady(tenantB.page, 60_000);

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

    // Poll until a "Sign" button appears on the PDF Signing landing page
    // The redesigned page shows received documents in a "Latest Task" card
    // with a "Sign" button directly visible (no section expansion needed).
    await pollUntil(
      tenantB.page,
      async () => {
        const signBtn = tenantB.page
          .getByRole('button', { name: 'Sign', exact: true })
          .first();
        return signBtn.isVisible().catch(() => false);
      },
      { timeout: 120_000, interval: 5_000, reloadBetween: true, sidebarLink: 'PDF Signing' }
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
    // Switch to the "all tasks" view
    await tenantB.page.getByRole('button', { name: 'View All', exact: true }).click();
    await tenantB.page.waitForTimeout(1_000);

    // Poll until "Return to Owner" button appears (without reloading, which resets the view)
    await pollUntil(
      tenantB.page,
      async () => {
        return tenantB.page
          .getByText('Return to Owner', { exact: true })
          .first()
          .isVisible()
          .catch(() => false);
      },
      { timeout: 90_000, interval: 5_000, reloadBetween: false }
    );

    await pdfSigningB.returnToOwner();

    // ============================================================
    // PHASE 6: Owner Verifies Signature
    // ============================================================

    await pdfSigningA.goto();

    // Poll until "Verify" button appears — reload between polls so
    // the status endpoint re-fetches after the signed PDF arrives via DIDComm.
    // After each SPA reload we switch to the tasks view.
    await pollUntil(
      tenantA.page,
      async () => {
        const viewAllBtn = tenantA.page.getByRole('button', { name: 'View All', exact: true });
        if (await viewAllBtn.isVisible().catch(() => false)) {
          await viewAllBtn.click();
          await tenantA.page.waitForTimeout(500);
        }
        return tenantA.page
          .getByText('Verify', { exact: true })
          .first()
          .isVisible()
          .catch(() => false);
      },
      { timeout: 120_000, interval: 5_000, reloadBetween: true, sidebarLink: 'PDF Signing' }
    );

    const { valid, signerName } = await pdfSigningA.verifySignature();
    expect(valid).toBe(true);
    // The signer common name should contain the name used during signing
    if (signerName) {
      expect(signerName).toContain('E2E');
    }
  });
});
