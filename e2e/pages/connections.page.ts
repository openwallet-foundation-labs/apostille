import { Page, expect } from '@playwright/test';

export class ConnectionsPage {
  constructor(private page: Page) {}

  async goto() {
    // Use SPA navigation via sidebar link to preserve auth state
    // (full page.goto() loses in-memory access tokens)
    const currentUrl = this.page.url();
    if (currentUrl.includes('/dashboard')) {
      // Already on dashboard — click sidebar link for SPA navigation
      await this.page.getByRole('link', { name: 'Connections', exact: true }).click();
    } else {
      // Not on dashboard — full navigation needed
      await this.page.goto('/dashboard/connections');
    }
    await this.page.waitForURL('**/dashboard/connections', { timeout: 15_000 });
    // Wait for page content to load
    await this.page
      .waitForSelector('table, h1, h2', { timeout: 15_000 })
      .catch(() => {});
  }

  /**
   * Create an invitation and return the invitation URL.
   */
  async createInvitation(label?: string): Promise<string> {
    if (label) {
      await this.page
        .locator('input[placeholder*="Invitation label"]')
        .fill(label);
    }

    await this.page
      .getByText('Create Invitation', { exact: true })
      .click();

    // Wait for the invitation card to appear
    await this.page
      .getByText('Invitation Created')
      .waitFor({ timeout: 30_000 });

    // Switch to URL view (default shows QR code)
    const showUrlBtn = this.page.getByText('Show URL');
    if (await showUrlBtn.isVisible().catch(() => false)) {
      await showUrlBtn.click();
    }

    // Extract the invitation URL from monospace text
    const urlText = await this.page
      .locator('.font-mono.text-sm')
      .first()
      .textContent();
    return (urlText || '').trim();
  }

  /**
   * Accept an invitation using a URL.
   */
  async acceptInvitation(invitationUrl: string) {
    // Toggle the accept form open
    const acceptBtn = this.page.getByText('Accept Invitation', { exact: true });
    if (await acceptBtn.isVisible().catch(() => false)) {
      await acceptBtn.click();
    }

    // Fill in the URL
    await this.page.locator('#invitationUrl').fill(invitationUrl);

    // Submit the form
    await this.page
      .locator('form button[type="submit"]')
      .click();

    // Wait for success alert
    await this.page
      .locator('.alert-success')
      .waitFor({ timeout: 30_000 });
  }

  /**
   * Click "Exchange Keys" on the first completed connection.
   */
  async exchangeKeys() {
    await this.page.getByText('Exchange Keys', { exact: true }).click();

    // Wait for "Awaiting Peer" status or button to appear
    await expect(
      this.page.getByRole('button', { name: 'Awaiting Peer' })
    ).toBeVisible({ timeout: 30_000 });
  }

  /**
   * Click "Accept Key Exchange" on the first connection with pending request.
   */
  async acceptKeyExchange() {
    await this.page.getByText('Accept Key Exchange').click();

    // Wait for KEM status to show Ready
    await expect(
      this.page.getByText('Ready').first()
    ).toBeVisible({ timeout: 30_000 });
  }

  async reload() {
    await this.page.reload();
    await this.page
      .waitForSelector('table, h1, h2', { timeout: 15_000 })
      .catch(() => {});
  }
}
