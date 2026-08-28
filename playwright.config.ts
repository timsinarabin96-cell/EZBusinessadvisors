/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { defineConfig, devices } from '@playwright/test'

// =============================================================================
// Playwright E2E — runs against the LIVE deployed site by default.
// Override with `BASE_URL` env (e.g. http://localhost:3000 for local runs).
//
// Self-contained: loads .env.local (if present) so suites that need Supabase
// admin access (owner-trust, lifecycle) get NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY automatically — same file the app uses.
// =============================================================================

// Minimal dotenv load — Next.js already bundles dotenv; this is a fallback so
// plain `npx playwright test` picks up .env.local too.
try {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const p = path.join(process.cwd(), '.env.local')
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)="?([^"\n]*)"?$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  }
} catch { /* non-fatal */ }

const BASE_URL = process.env.BASE_URL || 'https://ezbusinessadvisors.vercel.app'

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
