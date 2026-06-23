import { test, expect } from '@playwright/test';
import {
  FINANCE_SEED,
  financeDevEnabled,
  loginAsParent,
  resetPendingPaymentEngagement,
} from './helpers/finance-dev';

/**
 * @deprecated Prefer e2e/finance-payment.spec.ts — same flows with reset helpers and email audit.
 *
 * Legacy env-only entry point kept for manual URL testing:
 *   PLAYWRIGHT_FINANCE_DEV=1 PLAYWRIGHT_FINANCE_PAY_URL=/enrol/pay/<id> ...
 */
test.describe('@finance-local finance mock happy path (legacy)', () => {
  test.skip(!!process.env.CI, 'requires hosted dev + finance seed; not run in CI');

  const payUrl = process.env.PLAYWRIGHT_FINANCE_PAY_URL;
  const useLegacyUrl = Boolean(payUrl) && !financeDevEnabled();

  test('mock checkout completes enrolment on success', async ({ page }) => {
    test.skip(useLegacyUrl && !payUrl, 'Set PLAYWRIGHT_FINANCE_PAY_URL or PLAYWRIGHT_FINANCE_DEV=1');

    if (financeDevEnabled()) {
      await resetPendingPaymentEngagement();
      await loginAsParent(page, `/enrol/pay/${FINANCE_SEED.engagementId}`);
    } else {
      await page.goto(payUrl!);
    }

    const cardInput = page.getByPlaceholder(FINANCE_SEED.successCard);
    await expect(cardInput).toBeVisible({ timeout: 30_000 });
    await cardInput.fill(FINANCE_SEED.successCard);
    await page.getByRole('button', { name: /pay now/i }).click();

    await expect(cardInput).toBeHidden({ timeout: 45_000 });
  });

  test('mock checkout surfaces a decline error', async ({ page }) => {
    test.skip(useLegacyUrl && !payUrl, 'Set PLAYWRIGHT_FINANCE_PAY_URL or PLAYWRIGHT_FINANCE_DEV=1');

    if (financeDevEnabled()) {
      await resetPendingPaymentEngagement();
      await loginAsParent(page, `/enrol/pay/${FINANCE_SEED.engagementId}`);
    } else {
      await page.goto(payUrl!);
    }

    const cardInput = page.getByPlaceholder(FINANCE_SEED.successCard);
    await expect(cardInput).toBeVisible({ timeout: 30_000 });
    await cardInput.fill(FINANCE_SEED.declineCard);
    await page.getByRole('button', { name: /pay now/i }).click();

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 30_000 });
  });
});
