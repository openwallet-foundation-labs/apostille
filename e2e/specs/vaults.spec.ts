import { test, expect } from '../fixtures/auth.fixture';
import { VaultsPage } from '../pages/vaults.page';
import { ConnectionsPage } from '../pages/connections.page';
import { waitForConnectionCompleted } from '../helpers/wait-helpers';
import * as path from 'path';

const TEST_PDF_PATH = path.resolve(
  __dirname,
  '..',
  'test-assets',
  'test-document.pdf'
);
const VAULT_PASSPHRASE = 'TestVault1!';

test.describe.serial('Vault CRUD', () => {
  test('shows empty state initially', async ({ tenantA }) => {
    const vaults = new VaultsPage(tenantA.page);
    await vaults.goto();
    await expect(
      tenantA.page.getByRole('heading', { name: 'Encrypted Vaults' })
    ).toBeVisible();
    await expect(tenantA.page.getByText('+ Create Vault')).toBeVisible();
    await vaults.expectEmptyState();
  });

  test('create a vault', async ({ tenantA }) => {
    const vaults = new VaultsPage(tenantA.page);
    await vaults.goto();
    await vaults.openCreateModal();
    await vaults.fillAndSubmitCreateForm(
      TEST_PDF_PATH,
      VAULT_PASSPHRASE,
      'E2E test vault'
    );
    await vaults.expectToast('Vault created successfully!');
    await vaults.expectVaultInList('test-document.pdf');
  });

  test('create button disabled without required fields', async ({
    tenantA,
  }) => {
    const vaults = new VaultsPage(tenantA.page);
    await vaults.goto();
    await vaults.openCreateModal();

    // Neither file nor passphrase → disabled
    await vaults.expectCreateButtonDisabled();

    // File only → still disabled
    await vaults.setFile(TEST_PDF_PATH);
    await vaults.expectCreateButtonDisabled();

    // File + passphrase → enabled
    await vaults.setPassphrase(VAULT_PASSPHRASE);
    await vaults.expectCreateButtonEnabled();

    await vaults.cancelCreateModal();
  });

  test('cancel closes create modal', async ({ tenantA }) => {
    const vaults = new VaultsPage(tenantA.page);
    await vaults.goto();
    await vaults.openCreateModal();
    await vaults.cancelCreateModal();
    await vaults.expectCreateModalClosed();
  });

  test('decrypt vault with correct passphrase', async ({ tenantA }) => {
    const vaults = new VaultsPage(tenantA.page);
    await vaults.goto();
    await vaults.openVault('test-document.pdf');
    await vaults.decryptVault(VAULT_PASSPHRASE);
    await vaults.expectDecryptSuccess();
    await vaults.expectDownloadButton();
  });

  test('decrypt vault with wrong passphrase shows error', async ({
    tenantA,
  }) => {
    const vaults = new VaultsPage(tenantA.page);
    await vaults.goto();
    await vaults.openVault('test-document.pdf');
    await vaults.decryptVault('WrongPassphrase!');
    // The API returns an error toast on decryption failure
    await vaults.expectToast('decrypt');
  });

  test('delete vault', async ({ tenantA }) => {
    const vaults = new VaultsPage(tenantA.page);
    await vaults.goto();
    await vaults.deleteVault('test-document.pdf');
    await vaults.expectToast('Vault deleted successfully');

    // Wait for list to update, then check empty state
    await tenantA.page.waitForTimeout(2_000);
    await vaults.reload();
    await vaults.expectEmptyState();
  });
});

test.describe('Vault Sharing', () => {
  test('share vault with connected tenant', async ({ tenantA, tenantB }) => {
    test.setTimeout(300_000);

    // ── Phase 1: Establish connection ──
    const connectionsA = new ConnectionsPage(tenantA.page);
    const connectionsB = new ConnectionsPage(tenantB.page);

    await connectionsA.goto();
    const invitationUrl = await connectionsA.createInvitation('Vault Share');
    expect(invitationUrl).toBeTruthy();

    await connectionsB.goto();
    await connectionsB.acceptInvitation(invitationUrl);

    await waitForConnectionCompleted(tenantB.page, 60_000);
    await connectionsA.goto();
    await waitForConnectionCompleted(tenantA.page, 60_000);

    // ── Phase 2: Create vault ──
    const vaultsA = new VaultsPage(tenantA.page);
    await vaultsA.goto();
    await vaultsA.openCreateModal();
    await vaultsA.fillAndSubmitCreateForm(
      TEST_PDF_PATH,
      VAULT_PASSPHRASE,
      'Shared vault'
    );
    await vaultsA.expectToast('Vault created successfully!');
    await vaultsA.expectVaultInList('test-document.pdf');

    // ── Phase 3: Share vault ──
    await vaultsA.openShareModal('test-document.pdf');
    await vaultsA.shareVault('tenant-b');
    await vaultsA.expectToast('Vault shared successfully!');
  });
});
