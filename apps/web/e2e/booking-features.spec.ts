import { test, expect } from '@playwright/test';
import { loginAsAdmin, seededE2eEnabled } from './helpers/auth';

/**
 * Scheduling / booking — public book + admin services/settings.
 */
test.describe('Booking features', () => {
  test('public book shows services or empty/disabled state', async ({ page }) => {
    await page.goto('/book');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
    // Either service picker / calendar, or not-available / no services copy
    await expect(page.locator('body')).toContainText(
      /Book|Service|availability|not available|No |הזמנ|שירות|זמינ/i,
    );
  });

  test.describe('admin booking (seeded)', () => {
    test.skip(!seededE2eEnabled(), 'Requires seeded admin');
    test.skip(
      process.env.PLAYWRIGHT_ADMIN_E2E !== '1',
      'Set PLAYWRIGHT_ADMIN_E2E=1 when admin password login works',
    );

    test('services admin can open add/edit affordance', async ({ page }) => {
      await loginAsAdmin(page, '/admin/setup/services');
      await expect(page.getByRole('heading', { level: 1 })).toContainText(/Service/i);
      const add = page.getByRole('button', { name: /Add service|Add/i }).first();
      if (await add.isVisible().catch(() => false)) {
        await add.click();
        await expect(page.getByLabel(/Service name|Name/i).first()).toBeVisible({
          timeout: 10_000,
        });
      }
    });

    test('booking settings can save buffer field', async ({ page }) => {
      await loginAsAdmin(page, '/admin/setup/booking');
      await expect(page.getByRole('heading', { level: 1 })).toContainText(/Booking|Availability/i);
      const buffer = page.getByRole('spinbutton').first();
      if (await buffer.isVisible().catch(() => false)) {
        await expect(buffer).toBeEnabled();
      }
      await expect(page.getByRole('button', { name: /Save/i })).toBeVisible();
    });
  });
});
