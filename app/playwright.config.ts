import { defineConfig, devices } from '@playwright/test';

/**
 * Lightweight Playwright config for Kindling's smoke tests. Starts the Vite
 * dev server on a free port automatically and tears it down after.
 *
 * Run with:  npx playwright test
 * First time: npx playwright install chromium
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
