import { test, expect } from '@playwright/test';
import { i18n } from './helpers/matchers';

/**
 * Public / unauthenticated surfaces — always run (no seed login required).
 */
test.describe('Public features', () => {
  test('classes catalogue loads', async ({ page }) => {
    await page.goto('/classes');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(i18n.classes);
  });

  test('login page: magic link + password tabs', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('form').getByRole('button', { name: /sign in|התחבר/i })).toBeVisible();
    await page.getByRole('tab', { name: /magic link|קישור קסם/i }).click();
    await expect(page.getByRole('button', { name: /send link|שלח/i })).toBeVisible();
  });

  test('signup page loads', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('form input').first()).toBeVisible();
  });

  test('create-studio page loads', async ({ page }) => {
    await page.goto('/create-studio');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('book page loads when scheduling enabled', async ({ page }) => {
    await page.goto('/book');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
  });

  test('guest enrolment wizard entry loads', async ({ page }) => {
    await page.goto('/enrol');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });
  });

  test('protected admin route redirects to login', async ({ page }) => {
    await page.goto('/admin/students');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test('unknown route shows not found', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-e2e');
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible({ timeout: 10_000 });
  });
});
