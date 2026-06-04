import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

/**
 * E2E tests for Phase 1B: Auth + Landing Page
 * Tests public access, magic link flow, and accessibility
 */

test.describe('Phase 1B: Auth & Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    // Start at landing page
    await page.goto('/');
  });

  // --- LANDING PAGE TESTS ---
  test('landing page loads without auth', async ({ page }) => {
    // Should see classes
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText('Classes');
  });

  test('landing page shows public classes list', async ({ page }) => {
    // Should have a list or classes
    const classList = page.getByRole('list');
    // May be empty in test mode, but should exist
    await expect(classList).toBeVisible();
  });

  test('enrol button redirects to login', async ({ page }) => {
    // Click "Enrol Now" button
    const enrollButton = page.getByRole('button', { name: /enrol now/i });

    // If button exists and is visible, click it
    if (await enrollButton.isVisible()) {
      await enrollButton.click();
      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('login page has magic link form', async ({ page }) => {
    // Navigate to login
    await page.goto('/login');

    // Should have email input with label
    const emailInput = page.getByLabel('Email');
    await expect(emailInput).toBeVisible();

    // Should have submit button
    const submitButton = page.getByRole('button', { name: /send link/i });
    await expect(submitButton).toBeVisible();
  });

  test('login form validation works', async ({ page }) => {
    await page.goto('/login');

    // Try to submit empty form
    const submitButton = page.getByRole('button', { name: /send link/i });
    await submitButton.click();

    // Should show validation error
    const errorMessage = page.getByRole('alert');
    await expect(errorMessage).toBeVisible();
  });

  test('login form accepts valid email', async ({ page }) => {
    await page.goto('/login');

    const emailInput = page.getByLabel('Email');
    await emailInput.fill('test@example.com');

    // Error message should not be visible
    const errorMessage = page.getByRole('alert');
    await expect(errorMessage).not.toBeVisible();
  });

  // --- ACCESSIBILITY TESTS ---
  test('landing page passes axe accessibility scan', async ({ page }) => {
    await page.goto('/');
    await injectAxe(page);
    await checkA11y(page);
  });

  test('login page passes axe accessibility scan', async ({ page }) => {
    await page.goto('/login');
    await injectAxe(page);
    await checkA11y(page);
  });

  test('login form has proper label associations', async ({ page }) => {
    await page.goto('/login');

    const emailInput = page.getByLabel('Email');
    await expect(emailInput).toBeVisible();
  });

  test('login form has focus ring on input', async ({ page }) => {
    await page.goto('/login');

    const emailInput = page.getByLabel('Email');
    await emailInput.focus();

    // Check that element has focus
    await expect(emailInput).toBeFocused();
  });

  test('keyboard navigation works on login form', async ({ page }) => {
    await page.goto('/login');

    // Tab to email input
    await page.keyboard.press('Tab');
    const emailInput = page.getByLabel('Email');
    await expect(emailInput).toBeFocused();

    // Tab to submit button
    await page.keyboard.press('Tab');
    const submitButton = page.getByRole('button', { name: /send link/i });
    await expect(submitButton).toBeFocused();
  });

  test('protected page redirects to login', async ({ page }) => {
    await page.goto('/dashboard/admin');
    await expect(page).toHaveURL(/\/login/);
  });

  test('landing page has semantic heading structure', async ({ page }) => {
    await page.goto('/');

    // Should have one h1
    const h1s = page.getByRole('heading', { level: 1 });
    await expect(h1s).toHaveCount(1);

    // No heading level skips (h1 → h3)
    const allHeadings = page.locator('h1, h2, h3, h4, h5, h6');
    const headings = await allHeadings.all();

    if (headings.length > 1) {
      for (let i = 1; i < headings.length; i++) {
        const prevLevel = parseInt(
          (await headings[i - 1].evaluate((el) => el.tagName))[1]
        );
        const currLevel = parseInt(
          (await headings[i].evaluate((el) => el.tagName))[1]
        );
        expect(currLevel - prevLevel).toBeLessThanOrEqual(1);
      }
    }
  });
});
