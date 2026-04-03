import { Page, expect } from '@playwright/test';

export class VaultsPage {
  constructor(private page: Page) {}

  async goto() {
    // Close any open modal first (e.g. from a previous serial test)
    await this.closeModalIfOpen();

    const currentUrl = this.page.url();
    if (currentUrl.includes('/dashboard')) {
      await this.page.getByRole('link', { name: 'Vaults', exact: true }).click();
    } else {
      await this.page.goto('/dashboard/vaults');
    }
    await this.page.waitForURL('**/dashboard/vaults', { timeout: 15_000 });
    await this.page
      .getByRole('heading', { name: 'Encrypted Vaults' })
      .waitFor({ timeout: 15_000 });
  }

  async closeModalIfOpen() {
    const closeBtn = this.page.locator('.modal-container svg').first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
      await this.page
        .locator('.modal-backdrop')
        .waitFor({ state: 'hidden', timeout: 3_000 })
        .catch(() => {});
    }
  }

  async expectEmptyState() {
    await expect(this.page.getByText('No vaults yet')).toBeVisible();
  }

  async openCreateModal() {
    await this.page.getByText('+ Create Vault').click();
    await this.page
      .locator('h3', { hasText: 'Create Encrypted Vault' })
      .waitFor({ timeout: 10_000 });
  }

  async setFile(filePath: string) {
    const fileInput = this.page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);
  }

  async setPassphrase(passphrase: string) {
    await this.page
      .locator('input[placeholder="Enter a strong passphrase"]')
      .fill(passphrase);
  }

  async fillAndSubmitCreateForm(
    filePath: string,
    passphrase: string,
    description?: string
  ) {
    await this.setFile(filePath);
    await this.setPassphrase(passphrase);

    if (description) {
      await this.page
        .locator('input[placeholder="e.g., Employment contract"]')
        .fill(description);
    }

    // Click the "Create Vault" button inside the modal
    await this.page
      .locator('.modal-container')
      .getByRole('button', { name: 'Create Vault' })
      .click();

    // Wait for modal to close (indicates success)
    await expect(
      this.page.locator('h3', { hasText: 'Create Encrypted Vault' })
    ).not.toBeVisible({ timeout: 30_000 });
  }

  async expectCreateButtonDisabled() {
    await expect(
      this.page
        .locator('.modal-container')
        .getByRole('button', { name: 'Create Vault' })
    ).toBeDisabled();
  }

  async expectCreateButtonEnabled() {
    await expect(
      this.page
        .locator('.modal-container')
        .getByRole('button', { name: 'Create Vault' })
    ).toBeEnabled();
  }

  async cancelCreateModal() {
    await this.page
      .locator('.modal-container')
      .getByRole('button', { name: 'Cancel' })
      .click();
  }

  async expectCreateModalClosed() {
    await expect(
      this.page.locator('h3', { hasText: 'Create Encrypted Vault' })
    ).not.toBeVisible({ timeout: 5_000 });
  }

  async openVault(filename: string) {
    const row = this.page
      .locator('.divide-y > div')
      .filter({ hasText: filename });
    await row.getByRole('button', { name: 'Open' }).click();
    await this.page
      .locator('h3', { hasText: 'Open Vault' })
      .waitFor({ timeout: 10_000 });
  }

  async decryptVault(passphrase: string) {
    await this.page
      .locator('input[placeholder="Enter vault passphrase"]')
      .fill(passphrase);
    await this.page.getByRole('button', { name: 'Decrypt Vault' }).click();
  }

  async expectDecryptSuccess() {
    // Use the modal heading/span specifically to avoid strict mode conflict with toast
    await expect(
      this.page.locator('.modal-container').getByText('Vault Decrypted Successfully')
    ).toBeVisible({ timeout: 30_000 });
  }

  async expectDownloadButton() {
    await expect(
      this.page.getByRole('button', { name: 'Download File' })
    ).toBeVisible();
  }

  async deleteVault(filename: string) {
    this.page.once('dialog', (dialog) => dialog.accept());
    const row = this.page
      .locator('.divide-y > div')
      .filter({ hasText: filename });
    await row.getByRole('button', { name: 'Delete' }).click();
  }

  async openShareModal(filename: string) {
    const row = this.page
      .locator('.divide-y > div')
      .filter({ hasText: filename });
    await row.getByRole('button', { name: 'Share' }).click();
    await this.page
      .locator('h3', { hasText: 'Share Vault' })
      .waitFor({ timeout: 10_000 });
  }

  async shareVault(connectionLabel: string) {
    const select = this.page.locator('.modal-container select').first();
    await this.page.waitForTimeout(1_000);

    const options = await select.locator('option').all();
    for (const option of options) {
      const text = await option.textContent();
      if (text && text.includes(connectionLabel)) {
        const value = await option.getAttribute('value');
        if (value) {
          await select.selectOption(value);
          break;
        }
      }
    }

    await this.page
      .locator('.modal-container')
      .getByRole('button', { name: 'Share Vault' })
      .click();
  }

  async expectToast(text: string) {
    // Toast may use different class structures; try role-based first, then class-based
    const toastByRole = this.page.getByRole('alert').filter({ hasText: text });
    const toastByClass = this.page.locator('.Toastify__toast-body', { hasText: text });
    await expect(toastByRole.or(toastByClass)).toBeVisible({ timeout: 15_000 });
  }

  async expectVaultInList(filename: string) {
    await expect(
      this.page.locator('.divide-y > div').filter({ hasText: filename })
    ).toBeVisible({ timeout: 10_000 });
  }

  async reload() {
    await this.page.reload();
    await this.page
      .getByRole('heading', { name: 'Encrypted Vaults' })
      .waitFor({ timeout: 15_000 });
  }
}
