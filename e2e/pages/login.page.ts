import { Page, expect } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.page.locator('#email').fill(email);
    await this.page.locator('#password').fill(password);
    await this.page.locator('button[type="submit"]').click();
    await this.page.waitForURL('**/dashboard', { timeout: 30_000 });
  }

  async expectError(message: string) {
    await expect(this.page.locator('.alert-error')).toContainText(message);
  }
}
