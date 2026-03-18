import { Page } from '@playwright/test';

export class SignupPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/signup');
  }

  async register(label: string, email: string, password: string) {
    await this.page.locator('#wallet-label').fill(label);
    await this.page.locator('#email-address').fill(email);
    await this.page.locator('#password').fill(password);
    await this.page.locator('#confirm-password').fill(password);
    await this.page.locator('button[type="submit"]').click();
  }

  async waitForSuccess(): Promise<string> {
    await this.page
      .getByText('Registration Successful!')
      .waitFor({ timeout: 90_000 });
    const tenantId = await this.page
      .locator('.font-mono')
      .first()
      .textContent();
    return (tenantId || '').trim();
  }

  async goToLogin() {
    await this.page.getByText('Go to Login').click();
    await this.page.waitForURL('**/login');
  }
}
