import { defineConfig, devices } from '@playwright/test'

// =============================================================================
// Playwright E2E — runs against the LIVE deployed site by default.
// Override with `BASE_URL` env (e.g. http://localhost:3000 for local runs).
// =============================================================================

const BASE_URL = process.env.BASE_URL || 'https://concord-deal-platform.vercel.app'

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
