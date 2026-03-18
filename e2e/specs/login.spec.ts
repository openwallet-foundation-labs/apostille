import { test, expect, Browser } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { SignupPage } from '../pages/signup.page';

// Shared credentials registered once for all tests
let registeredEmail: string;
const TEST_PASSWORD = 'TestPass1!';

function uniqueEmail(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 7);
  return `login-e2e-${ts}-${rand}@e2e-test.local`;
}

test.describe('Login', () => {
  test.beforeAll(async ({ browser }) => {
    // Register a user for login tests
    const context = await browser.newContext();
    const page = await context.newPage();
    const signup = new SignupPage(page);

    registeredEmail = uniqueEmail();
    await signup.goto();
    await signup.register('Login Test', registeredEmail, TEST_PASSWORD);
    await signup.waitForSuccess();
    await context.close();
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(registeredEmail, TEST_PASSWORD);
    expect(page.url()).toContain('/dashboard');
  });

  test('wrong password shows error', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await page.locator('#email').fill(registeredEmail);
    await page.locator('#password').fill('WrongPassword123!');
    await page.locator('button[type="submit"]').click();

    await loginPage.expectError('Invalid email or password');
  });

  test('non-existent email shows error', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await page.locator('#email').fill(`nonexistent-${Date.now()}@e2e-test.local`);
    await page.locator('#password').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await loginPage.expectError('Invalid email or password');
  });

  test('empty fields are blocked by browser validation', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await page.locator('button[type="submit"]').click();

    // URL should still be /login — form was not submitted
    expect(page.url()).toContain('/login');

    // HTML required attribute triggers native validation
    const validationMessage = await page
      .locator('#email')
      .evaluate((el: HTMLInputElement) => el.validationMessage);
    expect(validationMessage).toBeTruthy();
  });

  test('invalid email format is blocked', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await page.locator('#email').fill('not-an-email');
    await page.locator('#password').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();

    // URL should still be /login
    expect(page.url()).toContain('/login');

    // HTML type="email" triggers native validation
    const validationMessage = await page
      .locator('#email')
      .evaluate((el: HTMLInputElement) => el.validationMessage);
    expect(validationMessage).toBeTruthy();
  });

  test('navigate to signup page', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await page.getByText('Create one now').click();
    await page.waitForURL('**/signup', { timeout: 10_000 });
    expect(page.url()).toContain('/signup');
  });
});
