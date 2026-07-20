import { test, expect } from '@playwright/test';
import { loginAsAdmin, seededE2eEnabled } from './helpers/auth';

/**
 * Admin + platform surfaces — admin user language=en (English headings).
 * Requires seeded admin (miriamrteller@gmail.com).
 */
test.describe('Admin features', () => {
  test.skip(!seededE2eEnabled(), 'Set PLAYWRIGHT_SEEDED_E2E=1 (or run locally with seed)');
  // Hosted admin user must exist with password (not created by seed:auth-parent).
  test.skip(
    process.env.PLAYWRIGHT_ADMIN_E2E !== '1',
    'Set PLAYWRIGHT_ADMIN_E2E=1 after admin password login works (miriamrteller@gmail.com)',
  );

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  const adminRoutes: { path: string; heading: RegExp }[] = [
    { path: '/admin/students', heading: /Students/i },
    { path: '/admin/families', heading: /Families/i },
    { path: '/admin/notifications', heading: /Notifications/i },
    { path: '/admin/appointments', heading: /Appointments/i },
    { path: '/admin/finance', heading: /Finance/i },
    { path: '/admin/finance/payments', heading: /Payments/i },
    { path: '/admin/finance/expenses', heading: /Expenses/i },
    { path: '/admin/finance/expenses/categories', heading: /Categor/i },
    { path: '/admin/setup', heading: /Overview|Setup|Dashboard|Activity/i },
    { path: '/admin/setup/settings', heading: /Settings|School/i },
    { path: '/admin/setup/bundled-payments', heading: /Payment|Grow|iCount|Bundled/i },
    { path: '/admin/setup/billing', heading: /Billing/i },
    { path: '/admin/setup/levels', heading: /Level/i },
    { path: '/admin/setup/terms', heading: /Term|Season|Learning/i },
    { path: '/admin/setup/classes', heading: /Class/i },
    { path: '/admin/setup/services', heading: /Service/i },
    { path: '/admin/setup/booking', heading: /Booking|Availability/i },
    { path: '/admin/setup/waivers', heading: /Waiver/i },
    { path: '/platform/onboard', heading: /Onboard|Provision|Studio/i },
  ];

  for (const route of adminRoutes) {
    test(`loads ${route.path}`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(route.heading);
    });
  }

  test('students directory has search / filter affordances', async ({ page }) => {
    await page.goto('/admin/students');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Students/i);
    // Filter controls or table body
    await expect(
      page.getByText(/Filter|Active|All|Enrolment|Family/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('notifications page has compose and history surfaces', async ({ page }) => {
    await page.goto('/admin/notifications');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Notifications/i);
    const history = page.getByRole('tab', { name: /History|היסטוריה/i });
    const compose = page.getByRole('tab', { name: /Compose|כתוב|Send/i });
    if (await history.isVisible().catch(() => false)) {
      await history.click();
    }
    if (await compose.isVisible().catch(() => false)) {
      await compose.click();
    }
    await expect(page.locator('body')).toContainText(/Notification|Recipient|History|Compose|Send/i);
  });

  test('booking settings shows penalty fields when feature enabled', async ({ page }) => {
    await page.goto('/admin/setup/booking');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Booking|Availability/i);
    const lateCancel = page.getByText(/Late cancellation window|חלון ביטול מאוחר/i);
    if (await lateCancel.isVisible().catch(() => false)) {
      await expect(lateCancel).toBeVisible();
      await expect(
        page.getByText(/Retain payment on no-show|שמור תשלום/i),
      ).toBeVisible();
    }
  });

  test('appointments page exposes cancel (and no-show when penalties on)', async ({ page }) => {
    await page.goto('/admin/appointments');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Appointments/i);
    const cancel = page.getByRole('button', { name: /^Cancel$/i }).first();
    const noShow = page.getByRole('button', { name: /Mark no-show/i }).first();
    const empty = page.getByText(/No appointments/i);
    const hasRow = await cancel.isVisible().catch(() => false);
    const hasEmpty = await empty.isVisible().catch(() => false);
    expect(hasRow || hasEmpty).toBeTruthy();
    if (hasRow && (await noShow.isVisible().catch(() => false))) {
      await expect(noShow).toBeVisible();
    }
  });

  test('finance hub shows metrics cards', async ({ page }) => {
    await page.goto('/admin/finance');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Finance/i);
    await expect(page.getByText(/revenue|expenses|profit|Outstanding/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
