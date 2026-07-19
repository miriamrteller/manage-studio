import { test, expect } from '@playwright/test';
import { loginAsParent, seededE2eEnabled } from './helpers/auth';
import { i18n } from './helpers/matchers';

/**
 * Parent portal — requires seeded parent auth (miriamrstern@gmail.com).
 */
test.describe('Parent portal features', () => {
  test.skip(!seededE2eEnabled(), 'Set PLAYWRIGHT_SEEDED_E2E=1 (or run locally with seed)');

  test.beforeEach(async ({ page }) => {
    await loginAsParent(page, '/dashboard/portal');
  });

  test('portal dashboard sections render', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText(i18n.portalHeading);
    await expect(page.getByRole('button', { name: i18n.notificationPrefs })).toBeVisible();
    await expect(page.getByRole('button', { name: i18n.enrolNew })).toBeVisible();
    await expect(page.getByText(i18n.childrenHeading)).toBeVisible();
  });

  test('notification preferences modal opens with notify_* scopes', async ({ page }) => {
    await page.getByRole('button', { name: i18n.notificationPrefs }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(i18n.prefsTitle)).toBeVisible();
    await expect(page.getByText(i18n.scopeHeading)).toBeVisible();
    await expect(
      page.getByText(/Class or appointment cancellations|ביטולי שיעורים/i),
    ).toBeVisible();
    await expect(page.getByText(/Payment reminders|תזכורות תשלום/i)).toBeVisible();
    await expect(page.getByText(/Waiting list|רשימת המתנה/i)).toBeVisible();
    await expect(page.getByText(/Schedule changes|שינויי לוח/i)).toBeVisible();
    await expect(page.getByText(/School announcements|הודעות בית הספר/i)).toBeVisible();
  });

  test('toggle notify scope and save persists after reload', async ({ page }) => {
    await page.getByRole('button', { name: i18n.notificationPrefs }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const announcements = dialog
      .locator('label')
      .filter({ hasText: /School announcements|הודעות בית הספר/i });
    const checkbox = announcements.locator('[role="checkbox"]').first();
    await expect(checkbox).toBeVisible();
    const before = await checkbox.getAttribute('data-state');
    await checkbox.click();
    await dialog.getByRole('button', { name: i18n.savePrefs }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await page.reload();
    await page.getByRole('button', { name: i18n.notificationPrefs }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const afterCheckbox = page
      .getByRole('dialog')
      .locator('label')
      .filter({ hasText: /School announcements|הודעות בית הספר/i })
      .locator('[role="checkbox"]')
      .first();
    const after = await afterCheckbox.getAttribute('data-state');
    expect(after).not.toBe(before);
    // Restore default (on) so re-runs are stable
    if (after === 'unchecked') {
      await afterCheckbox.click();
      await page.getByRole('dialog').getByRole('button', { name: i18n.savePrefs }).click();
    } else {
      await page.getByRole('dialog').getByRole('button', { name: /cancel|ביטול/i }).click();
    }
  });

  test('set login password dialog opens', async ({ page }) => {
    await page.getByRole('button', { name: /Login password|סיסמת התחברות/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel(/New password|סיסמה חדשה|password/i).first()).toBeVisible();
  });

  test('enrol CTA navigates toward enrolment', async ({ page }) => {
    await page.getByRole('button', { name: i18n.enrolNew }).click();
    await expect(page).toHaveURL(/\/enrol/, { timeout: 15_000 });
  });
});
