import { test, expect } from '@playwright/test';
import {
  FINANCE_SEED,
  financeDevEnabled,
  latestPaymentIdForEngagement,
  loginAsParent,
  resetPendingPaymentEngagement,
  waitForConfirmationEmailAudit,
} from './helpers/finance-dev';

/**
 * Finance payment E2E — @finance-dev.
 *
 * Runs against the linked dev Supabase project (creativeballet tenant, grow + GROW_MOCK).
 * Requires finance seed (`pnpm seed:dev -- --finance`) and parent auth (`pnpm seed:auth-parent`).
 *
 *   PLAYWRIGHT_FINANCE_DEV=1 pnpm -C apps/web run e2e:finance
 *
 * Env is loaded from repo-root `.env` and `apps/web/.env.local` (see scripts/load-env.mjs):
 *   VITE_SUPABASE_URL=https://<ref>.supabase.co
 *   VITE_SUPABASE_ANON_KEY=...
 *   VITE_DEV_TENANT_SUBDOMAIN=creativeballet
 *   SUPABASE_SERVICE_ROLE_KEY=...   (repo-root .env only — never commit)
 */
test.describe('@finance-dev payment checkout', () => {
  test.skip(!financeDevEnabled(), 'Set PLAYWRIGHT_FINANCE_DEV=1 to run against hosted dev');
  test.skip(!!process.env.CI, 'Not run in CI — requires hosted dev + finance seed');

  const payPath = `/enrol/pay/${FINANCE_SEED.engagementId}`;

  test.beforeEach(async () => {
    await resetPendingPaymentEngagement();
  });

  test('payment page loads with test card form', async ({ page }) => {
    await loginAsParent(page, payPath);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/pay|payment/i);

    const cardInput = page.getByPlaceholder(FINANCE_SEED.successCard);
    await expect(cardInput).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /pay now/i })).toBeVisible();
  });

  test('success card completes payment and triggers confirmation email audit', async ({ page }) => {
    await loginAsParent(page, payPath);

    const cardInput = page.getByPlaceholder(FINANCE_SEED.successCard);
    await expect(cardInput).toBeVisible({ timeout: 30_000 });
    await cardInput.fill(FINANCE_SEED.successCard);
    await page.getByRole('button', { name: /pay now/i }).click();

    await page.waitForURL(/\/dashboard\/portal/, { timeout: 45_000 });

    const paymentId = await latestPaymentIdForEngagement(FINANCE_SEED.engagementId);
    expect(paymentId).toBeTruthy();

    const audit = await waitForConfirmationEmailAudit(paymentId!);
    expect(audit.action).toBe('payment_confirmation_email_sent');
    expect(audit.after_state.recipient_email).toBe(FINANCE_SEED.parentEmail);
  });

  test('decline card shows error and stays on payment page', async ({ page }) => {
    await loginAsParent(page, payPath);

    const cardInput = page.getByPlaceholder(FINANCE_SEED.successCard);
    await expect(cardInput).toBeVisible({ timeout: 30_000 });
    await cardInput.fill(FINANCE_SEED.declineCard);
    await page.getByRole('button', { name: /pay now/i }).click();

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(new RegExp(payPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(cardInput).toBeVisible();

    const paymentId = await latestPaymentIdForEngagement(FINANCE_SEED.engagementId);
    expect(paymentId).toBeNull();
  });
});
