import {
  test as base,
  Browser,
  BrowserContext,
  Page,
  expect,
} from '@playwright/test';

const TEST_PASSWORD = 'TestPass1!';

function uniqueEmail(prefix: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 7);
  return `${prefix}-${ts}-${rand}@e2e-test.local`;
}

export interface TenantContext {
  context: BrowserContext;
  page: Page;
  email: string;
  password: string;
  tenantId: string;
}

interface TwoTenantFixture {
  tenantA: TenantContext;
  tenantB: TenantContext;
}

async function createTenantContext(
  browser: Browser,
  prefix: string
): Promise<TenantContext> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = uniqueEmail(prefix);
  const password = TEST_PASSWORD;

  // Register
  await page.goto('/signup');
  await page.locator('#wallet-label').fill(`E2E ${prefix}`);
  await page.locator('#email-address').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#confirm-password').fill(password);
  await page.locator('button[type="submit"]').click();

  // Registration may auto-login and redirect to /dashboard, or show
  // the success heading. Handle both.
  let tenantId = '';

  const result = await Promise.race([
    page
      .getByRole('heading', { name: 'Registration Successful!' })
      .waitFor({ timeout: 120_000 })
      .then(() => 'heading' as const),
    page
      .waitForURL('**/dashboard', { timeout: 120_000 })
      .then(() => 'dashboard' as const),
  ]);

  if (result === 'heading') {
    // Extract tenant ID from the success page
    const tenantIdEl = page.locator('.font-mono').first();
    tenantId = ((await tenantIdEl.textContent()) || '').trim();
  } else {
    // AutoLogin redirected to dashboard — extract tenant ID from there
    await page.waitForSelector('text=Tenant ID:', { timeout: 10_000 });
    const tenantText = await page.locator('text=Tenant ID:').textContent();
    tenantId = (tenantText || '').replace('Tenant ID:', '').trim();
  }

  // Always do an explicit login to ensure proper httpOnly cookie session.
  // Navigate to login page and wait to see where we land.
  await page.goto('/login');
  // Give the auth guard a moment to redirect if session is active
  await page.waitForTimeout(2000);

  const currentUrl = page.url();
  if (currentUrl.includes('/dashboard')) {
    // Already authenticated — session cookies are working
  } else {
    // On login page — fill in credentials
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/dashboard', { timeout: 30_000 });
  }

  return { context, page, email, password, tenantId };
}

export const test = base.extend<TwoTenantFixture>({
  // tenantB depends on tenantA to ensure sequential registration
  // (concurrent agent creation can overwhelm the backend)
  tenantA: async ({ browser }, use) => {
    const ctx = await createTenantContext(browser, 'tenant-a');
    await use(ctx);
    await ctx.context.close();
  },
  tenantB: async ({ browser, tenantA }, use) => {
    // tenantA dependency ensures sequential creation
    void tenantA;
    const ctx = await createTenantContext(browser, 'tenant-b');
    await use(ctx);
    await ctx.context.close();
  },
});

export { expect } from '@playwright/test';
