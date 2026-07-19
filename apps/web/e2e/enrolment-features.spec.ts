import { test, expect } from '@playwright/test';
import { FINANCE_SEED, financeDevEnabled, loginAsParent } from './helpers/finance-dev';
import { loginAsAdmin, seededE2eEnabled } from './helpers/auth';

/**
 * Enrolment surfaces — guest wizard, parent path, pay page (finance-gated).
 */
test.describe('Enrolment features', () => {
  test('guest /enrol wizard shows first step UI', async ({ page }) => {
    await page.goto('/enrol');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).toContainText(
      /enrol|student|class|child|parent|הרשמ|תלמיד|שיעור/i,
    );
  });

  test.describe('parent enrolment path (seeded)', () => {
    test.skip(!seededE2eEnabled(), 'Requires seeded parent');

    test('parent can open enrol from portal', async ({ page }) => {
      await loginAsParent(page, '/dashboard/portal');
      await page.getByRole('button', { name: /Register for a class|הרשמה לשיעור/i }).click();
      await expect(page).toHaveURL(/\/enrol/);
      await expect(page.locator('body')).toContainText(/enrol|class|student|שיעור|תלמיד/i);
    });
  });

  test.describe('admin enrolment affordances (seeded)', () => {
    test.skip(!seededE2eEnabled(), 'Requires seeded admin');

    test('students list supports enrolment-related filters', async ({ page }) => {
      await loginAsAdmin(page, '/admin/students');
      await expect(page.getByRole('heading', { level: 1 })).toContainText(/Students/i);
      await expect(page.getByText(/Enrolment|status|Active|Filter/i).first()).toBeVisible();
    });
  });

  test.describe('@finance-dev pay page', () => {
    test.skip(!financeDevEnabled(), 'Set PLAYWRIGHT_FINANCE_DEV=1');
    test.skip(!!process.env.CI, 'Hosted finance seed only');

    test('seeded pending_payment pay page loads mock card form', async ({ page }) => {
      await loginAsParent(page, `/enrol/pay/${FINANCE_SEED.engagementId}`);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(/pay|payment/i);
      await expect(page.getByPlaceholder(FINANCE_SEED.successCard)).toBeVisible({
        timeout: 30_000,
      });
    });
  });
});
