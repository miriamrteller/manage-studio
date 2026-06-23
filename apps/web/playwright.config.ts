import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from '../../scripts/load-env.mjs';

// Load repo-root .env + apps/web/.env.local so finance E2E can use VITE_SUPABASE_* / SUPABASE_*.
loadEnv();

/**
 * Playwright Configuration for Ballet School Management System
 * E2E and accessibility testing across all browsers
 */
const lifecycle = process.env.npm_lifecycle_event ?? '';
const isRegtestRun = lifecycle === 'a11y:e2e:regtest' || lifecycle === 'a11y:e2e:full';
const isCi = !!process.env.CI;
const usePreviewServer = isRegtestRun || isCi;
const previewPort = 4173;
const previewUrl = `http://localhost:${previewPort}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: !isRegtestRun,
  forbidOnly: isCi,
  retries: isRegtestRun || isCi ? 1 : 0,
  workers: isRegtestRun || isCi ? 2 : undefined,
  timeout: 60_000,

  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || (usePreviewServer ? previewUrl : 'http://localhost:5173'),
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Mobile viewports for RTL testing
    {
      name: 'Mobile Chrome (RTL)',
      use: {
        ...devices['Pixel 5'],
        locale: 'he-IL',
        colorScheme: 'light',
      },
    },
  ],

  webServer: usePreviewServer
    ? {
        command: `pnpm run preview -- --port ${previewPort} --strictPort`,
        url: previewUrl,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : {
        command: 'pnpm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !isCi,
        timeout: 120_000,
      },
});
