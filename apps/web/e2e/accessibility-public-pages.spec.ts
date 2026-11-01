import { test, expect, type Page } from '@playwright/test';
import { injectAxe } from 'axe-playwright';

/**
 * Axe scan of the public, parent/client-facing pages (launch-readiness: the
 * original suite only scanned / and /login). Same rule as the home-page test:
 * fail on critical violations and on color-contrast; other rules stay advisory.
 *
 * CI builds with .env.e2e (placeholder Supabase), so these pages render their
 * loading/empty/error states. That is still the markup a parent sees first, and
 * it catches structure and contrast regressions in shared layout and forms.
 */
const PAGES = ['/classes', '/enrol', '/inquire', '/book', '/signup'];

interface AxeViolation {
  id: string;
  impact?: string | null;
  nodes?: unknown[];
}

async function blockingViolations(page: Page): Promise<AxeViolation[]> {
  await injectAxe(page);
  const results = await page.evaluate(async () => {
    const w = window as unknown as { axe?: { run?: () => Promise<{ violations: AxeViolation[] }> } };
    return (await w.axe?.run?.()) ?? { violations: [] };
  });
  return (results.violations ?? []).filter(
    (v) => v.impact === 'critical' || v.id === 'color-contrast',
  );
}

test.describe('Public pages: no critical or contrast violations', () => {
  // CI installs Chromium only (ci.yml); axe results do not depend on the engine.
  test.skip(({ browserName }) => browserName !== 'chromium', 'axe scan runs on Chromium only');
  for (const path of PAGES) {
    for (const lang of ['en', 'he'] as const) {
      test(`${path} (${lang})`, async ({ page }) => {
        await page.addInitScript((l) => window.localStorage.setItem('language', l), lang);
        await page.goto(path, { waitUntil: 'domcontentloaded' });
        await page.locator('main, [role="main"], body').first().waitFor({ state: 'visible', timeout: 15_000 });
        // Let the first data fetch settle into its loading/empty/error state.
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);

        const violations = await blockingViolations(page);
        if (violations.length > 0) {
          console.log(`Blocking violations on ${path} (${lang}):`, JSON.stringify(violations, null, 2));
        }
        expect(violations.map((v) => v.id)).toEqual([]);
      });
    }
  }
});
