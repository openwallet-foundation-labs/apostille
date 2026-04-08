import { Page, expect } from '@playwright/test';

export class PdfSigningPage {
  constructor(private page: Page) {}

  async goto() {
    // Use SPA navigation via sidebar link to preserve auth state
    const currentUrl = this.page.url();
    if (currentUrl.includes('/dashboard')) {
      await this.page.getByRole('link', { name: 'PDF Signing', exact: true }).click();
    } else {
      await this.page.goto('/dashboard/pdf-signing');
    }
    await this.page.waitForURL('**/dashboard/pdf-signing', { timeout: 15_000 });
    await this.page.getByText('PDF Signing').first().waitFor({ timeout: 15_000 });
  }

  /**
   * Expand a collapsible section by clicking its header button.
   * Sections are rendered as a .card with a button wrapping an h2 title.
   * Content is only visible when expanded (React conditional rendering).
   */
  async expandSection(sectionTitle: string) {
    const sectionCard = this.page
      .locator('.card')
      .filter({ has: this.page.locator('h2', { hasText: sectionTitle }) });

    await sectionCard.first().waitFor({ state: 'attached', timeout: 10_000 });

    const headerButton = sectionCard
      .locator('button[type="button"]')
      .filter({ has: this.page.locator('h2', { hasText: sectionTitle }) })
      .first();

    const isExpanded = await sectionCard
      .locator('.divide-y')
      .first()
      .isVisible()
      .catch(() => false);

    if (!isExpanded) {
      await headerButton.click();
      await this.page.waitForTimeout(300);
    }
  }

  /**
   * Owner: Upload a PDF for signing.
   */
  async uploadPdf(
    filePath: string,
    connectionLabel: string,
    description?: string
  ) {
    await this.page.getByText('+ Upload PDF').click();
    await this.page.getByText('Upload PDF for Signing').waitFor();

    // Upload file
    const fileInput = this.page.locator(
      'input[type="file"][accept="application/pdf"]'
    );
    await fileInput.setInputFiles(filePath);

    // Select recipient by clicking the checkbox next to the connection label
    await this.page.waitForTimeout(1_000);
    const recipientCheckbox = this.page
      .locator('.modal-container label')
      .filter({ hasText: connectionLabel })
      .locator('input[type="checkbox"]');
    await recipientCheckbox.check();

    if (description) {
      await this.page
        .locator('input[placeholder*="Employment contract"]')
        .fill(description);
    }

    // Step 1: Click "Next: Place Fields" to open the field placement editor
    await this.page.getByText('Next: Place Fields').click();

    // Wait for the full-screen FieldPlacementEditor to appear
    await this.page
      .locator('h3', { hasText: 'Place Signing Fields' })
      .waitFor({ timeout: 30_000 });

    // Wait for the PDF canvas to render
    const canvas = this.page.locator('canvas').first();
    await canvas.waitFor({ timeout: 15_000 });

    // Verify "Done - Send for Signing" is disabled (no fields placed yet)
    const doneBtn = this.page.getByText('Done - Send for Signing');
    await expect(doneBtn).toBeDisabled();

    // Drag the "Sign Here" palette item onto the PDF container.
    // The drop handler lives on the container wrapping the canvas, but the
    // FieldOverlay (pointer-events-auto) sits on top, so we use force: true.
    const signHereItem = this.page
      .locator('[draggable="true"]')
      .filter({ hasText: 'Sign Here' });
    const canvasBox = (await canvas.boundingBox())!;
    await signHereItem.dragTo(canvas, {
      targetPosition: {
        x: Math.floor(canvasBox.width / 2),
        y: Math.floor(canvasBox.height / 3),
      },
      force: true,
    });

    // Also drag a "Name" field to exercise the NameAdoptionModal during signing
    const nameItem = this.page
      .locator('[draggable="true"]')
      .filter({ hasText: 'Name' });
    await nameItem.dragTo(canvas, {
      targetPosition: {
        x: Math.floor(canvasBox.width / 2),
        y: Math.floor(canvasBox.height / 2),
      },
      force: true,
    });

    // "Done - Send for Signing" should now be enabled
    await expect(doneBtn).toBeEnabled({ timeout: 5_000 });

    // Step 2: Complete the upload with field placement
    await doneBtn.click();

    // Wait for the field placement editor to close (success)
    await expect(
      this.page.locator('h3', { hasText: 'Place Signing Fields' })
    ).not.toBeVisible({ timeout: 30_000 });
  }

  /**
   * Signer: Sign the first document in "Documents to Sign".
   * Generates a new signing key if needed.
   */
  async signPdf(options: {
    keyName: string;
    commonName: string;
    keyPassword: string;
  }) {
    // Expand the collapsible section first
    await this.expandSection('Documents to Sign');

    // Click "Sign" in the Documents to Sign section
    const signBtn = this.page
      .locator('.card')
      .filter({ hasText: 'Documents to Sign' })
      .getByText('Sign', { exact: true })
      .first();
    await signBtn.click();

    // After clicking Sign, the page downloads the PDF first.
    // Then it opens either the guided signing view (if fields exist) or the sign modal directly.
    const guidedViewHeading = this.page.locator('h3', { hasText: 'Review & Sign Document' });
    const signModalHeading = this.page.locator('h3', { hasText: 'Sign PDF' });

    await expect(guidedViewHeading.or(signModalHeading)).toBeVisible({ timeout: 60_000 });

    const hasGuidedView = await guidedViewHeading.isVisible();

    if (hasGuidedView) {
      // Wait for the Required Fields sidebar to appear, then click
      // the "Sign Here" entry — it triggers the same handleFieldClick
      // as clicking the overlay on the canvas.
      const sidebar = this.page.locator('text=Required Fields').locator('..');
      await sidebar.waitFor({ timeout: 15_000 });
      const signHereBtn = sidebar
        .getByRole('button')
        .filter({ hasText: 'Sign Here' })
        .first();
      await signHereBtn.click();

      // SignatureAdoptionModal should open
      await this.page
        .locator('h3', { hasText: 'Adopt Your Signature' })
        .waitFor({ timeout: 10_000 });

      // Type tab is active by default — fill the name input
      const nameInput = this.page.locator('input[placeholder="Your full name"]');
      await nameInput.fill(options.commonName);

      // First font is auto-selected — click "Adopt Signature"
      await this.page.getByText('Adopt Signature').click();

      // Wait for adoption modal to close
      await expect(
        this.page.locator('h3', { hasText: 'Adopt Your Signature' })
      ).not.toBeVisible({ timeout: 10_000 });

      // Handle any "Name" fields that trigger the NameAdoptionModal
      const nameFieldBtn = sidebar
        .getByRole('button')
        .filter({ hasText: 'Name' })
        .first();
      const hasNameField = await nameFieldBtn.isVisible().catch(() => false);

      if (hasNameField) {
        await nameFieldBtn.click();

        // NameAdoptionModal should open
        await this.page
          .locator('h3', { hasText: 'Enter Your Name' })
          .waitFor({ timeout: 10_000 });

        // Fill the name input and adopt
        await this.page
          .locator('input[placeholder="Your full name"]')
          .fill(options.commonName);
        await this.page.getByText('Adopt Name').click();

        // Wait for modal to close
        await expect(
          this.page.locator('h3', { hasText: 'Enter Your Name' })
        ).not.toBeVisible({ timeout: 10_000 });
      }

      // "Continue to Sign" should now be enabled — click it
      const continueBtn = this.page.getByText('Continue to Sign');
      await expect(continueBtn).toBeEnabled({ timeout: 5_000 });
      await continueBtn.click();

      // Wait for the guided view to close and the sign modal to appear
      await signModalHeading.waitFor({ timeout: 30_000 });
    }

    // === Key management flow (unchanged) ===

    // Check if we need to generate a key
    const generateBtn = this.page.getByText('Generate Key', { exact: true });
    const generateNewBtn = this.page.getByText('+ Generate New');

    const needsGenerate =
      (await generateBtn.isVisible().catch(() => false)) ||
      (await generateNewBtn.isVisible().catch(() => false));

    if (needsGenerate) {
      // Click whichever generate button is visible
      if (await generateBtn.isVisible().catch(() => false)) {
        await generateBtn.click();
      } else {
        await generateNewBtn.click();
      }

      // Fill key generation form
      await this.page
        .locator('input[placeholder="My Signing Key"]')
        .fill(options.keyName);
      await this.page
        .locator('input[placeholder="John Doe"]')
        .fill(options.commonName);

      // Password fields
      const passwordInputs = this.page.locator(
        'input[placeholder="Min 8 characters"]'
      );
      await passwordInputs.first().fill(options.keyPassword);
      await this.page
        .locator('input[placeholder="Confirm password"]')
        .first()
        .fill(options.keyPassword);

      // Generate
      await this.page.getByText('Generate & Select').click();

      // Wait for key generation to complete and view to switch back to selection
      await this.page
        .locator('input[placeholder="Enter your key password"]')
        .waitFor({ timeout: 60_000 });
    }

    // Enter key password
    const keyPasswordInput = this.page.locator(
      'input[placeholder="Enter your key password"]'
    );
    await keyPasswordInput.fill(options.keyPassword);

    // Click "Sign Document"
    await this.page.getByText('Sign Document').click();

    // Wait for signing to complete (downloads, signs locally, uploads)
    await expect(
      this.page.locator('h3', { hasText: 'Sign PDF' })
    ).not.toBeVisible({ timeout: 90_000 });
  }

  /**
   * Signer: Return the signed document to the owner.
   */
  async returnToOwner() {
    await this.expandSection('Signed - Return to Owner');

    const returnBtn = this.page
      .locator('.card')
      .filter({ hasText: 'Signed - Return to Owner' })
      .getByText('Return to Owner', { exact: true })
      .first();
    await returnBtn.click();

    // Wait briefly for the async return to complete
    await this.page.waitForTimeout(3_000);
  }

  /**
   * Owner: Verify the signature on the first signed document.
   * Returns verification result.
   */
  async verifySignature(): Promise<{
    valid: boolean;
    signerName: string;
  }> {
    // Expand the Signed Documents section and click Verify
    await this.expandSection('Signed Documents');

    const verifyBtn = this.page
      .locator('.card')
      .filter({ hasText: 'Signed Documents' })
      .getByText('Verify', { exact: true })
      .first();
    await verifyBtn.click();

    // Wait for verify modal
    await this.page.locator('h3', { hasText: 'Verify Signature' }).waitFor();

    // Click "Verify Signature" button in the modal
    await this.page
      .locator('.modal-container')
      .getByRole('button', { name: 'Verify Signature' })
      .click();

    // Wait for result
    const validBadge = this.page.getByText('Valid Signature');
    const invalidBadge = this.page.getByText('Invalid Signature');

    await expect(validBadge.or(invalidBadge)).toBeVisible({ timeout: 30_000 });

    const valid = await validBadge.isVisible();

    // Try to extract signer name from the details
    let signerName = '';
    if (valid) {
      try {
        const signerRow = this.page
          .locator('.modal-container')
          .locator('text=Signer')
          .locator('..');
        signerName =
          (await signerRow.locator('.text-text-primary').textContent()) || '';
      } catch {
        // Signer name may not be present
      }
    }

    // Close modal
    await this.page
      .locator('.modal-container')
      .getByText('Close')
      .click();

    return { valid, signerName: signerName.trim() };
  }

  async reload() {
    // Use SPA navigation to preserve in-memory auth tokens
    await this.page
      .getByRole('link', { name: 'Dashboard', exact: true })
      .first()
      .click();
    await this.page.waitForTimeout(500);
    await this.page
      .getByRole('link', { name: 'PDF Signing', exact: true })
      .first()
      .click();
    await this.page.waitForURL('**/dashboard/pdf-signing', { timeout: 15_000 });
    await this.page.getByText('PDF Signing').first().waitFor({ timeout: 15_000 });
  }
}
