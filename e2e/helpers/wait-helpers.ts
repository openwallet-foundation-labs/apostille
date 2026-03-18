import { Page } from '@playwright/test';

/**
 * SPA-friendly page refresh: navigates to Dashboard then back to the given
 * page via sidebar links, preserving in-memory auth tokens.
 */
async function spaRefresh(page: Page, returnToLink: string) {
  // Navigate away
  await page.getByRole('link', { name: 'Dashboard', exact: true }).first().click();
  await page.waitForTimeout(500);
  // Navigate back
  await page.getByRole('link', { name: returnToLink, exact: true }).first().click();
  await page.waitForTimeout(1000);
}

/**
 * Poll a page until a condition is met, optionally refreshing between checks.
 * Uses SPA navigation to preserve auth state.
 */
export async function pollUntil(
  page: Page,
  checkFn: () => Promise<boolean>,
  options: {
    timeout?: number;
    interval?: number;
    reloadBetween?: boolean;
    /** Sidebar link name to navigate back to after refresh */
    sidebarLink?: string;
  } = {}
) {
  const {
    timeout = 60_000,
    interval = 3_000,
    reloadBetween = true,
    sidebarLink = 'Connections',
  } = options;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const result = await checkFn();
    if (result) return;

    if (reloadBetween) {
      await spaRefresh(page, sidebarLink);
    }

    await page.waitForTimeout(interval);
  }

  throw new Error(`pollUntil timed out after ${timeout}ms`);
}

/**
 * Wait for a connection to reach 'completed' state on the connections page.
 */
export async function waitForConnectionCompleted(
  page: Page,
  timeout = 60_000
) {
  await pollUntil(
    page,
    async () => {
      return page
        .getByText('completed', { exact: true })
        .first()
        .isVisible()
        .catch(() => false);
    },
    { timeout, interval: 3_000, reloadBetween: true, sidebarLink: 'Connections' }
  );
}

/**
 * Wait for KEM status to show "Pending Request" on connections page.
 */
export async function waitForKemPendingRequest(
  page: Page,
  timeout = 60_000
) {
  await pollUntil(
    page,
    async () => {
      return page
        .getByText('Pending Request')
        .isVisible()
        .catch(() => false);
    },
    { timeout, interval: 3_000, reloadBetween: true, sidebarLink: 'Connections' }
  );
}

/**
 * Wait for KEM status to show "Ready" on connections page.
 */
export async function waitForKemReady(page: Page, timeout = 60_000) {
  await pollUntil(
    page,
    async () => {
      return page
        .getByText('Ready')
        .first()
        .isVisible()
        .catch(() => false);
    },
    { timeout, interval: 3_000, reloadBetween: true, sidebarLink: 'Connections' }
  );
}
