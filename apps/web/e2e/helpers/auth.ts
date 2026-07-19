import type { Page } from '@playwright/test';

/**
 * Seeded creativeballet users (see scripts/seed-dev.mjs / supabase/seed.sql).
 * Hosted: `pnpm seed:auth-parent` + `pnpm seed:dev` (and `--finance` for pay tests).
 */
export const SEED_USERS = {
  parentEmail: 'miriamrstern@gmail.com',
  adminEmail: 'miriamrteller@gmail.com',
  password: process.env.E2E_PARENT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? 'devPassword123',
} as const;

/** Local seeded E2E (skipped in CI unless PLAYWRIGHT_SEEDED_E2E=1). */
export function seededE2eEnabled(): boolean {
  if (process.env.PLAYWRIGHT_SEEDED_E2E === '1') return true;
  if (process.env.PLAYWRIGHT_SEEDED_E2E === '0') return false;
  return !process.env.CI;
}

async function loginWithPassword(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('tab', { name: /password|סיסמה/i }).click();
  await page.getByLabel(/email|דוא"?ל/i).fill(email);
  await page.getByLabel(/password|סיסמה/i).fill(password);
  await page.getByRole('button', { name: /sign in|התחבר/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

export async function loginAsParent(page: Page, thenNavigateTo?: string): Promise<void> {
  await loginWithPassword(page, SEED_USERS.parentEmail, SEED_USERS.password);
  if (thenNavigateTo) await page.goto(thenNavigateTo);
}

export async function loginAsAdmin(page: Page, thenNavigateTo?: string): Promise<void> {
  await loginWithPassword(page, SEED_USERS.adminEmail, SEED_USERS.password);
  if (thenNavigateTo) await page.goto(thenNavigateTo);
}
