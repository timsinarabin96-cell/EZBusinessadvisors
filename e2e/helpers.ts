// =============================================================================
// Shared E2E helpers — seeded test identity + login.
// The seed script (scripts/seed-e2e-user.mjs) creates this account via the
// Supabase admin API (email confirmed), then the agency via the real
// /api/billing/create-agency route so the whole stack is exercised.
// =============================================================================

import type { Page } from '@playwright/test'

export const E2E_USER = {
  email: process.env.E2E_EMAIL || 'e2e.qa@concordplatform.dev',
  password: process.env.E2E_PASSWORD || 'E2e!Test#2026#Concord',
  agencyName: 'QA Test Brokerage',
}

/** Sign in through the real auth UI. Assumes we're on /auth or navigates there. */
export async function signIn(page: Page, email = E2E_USER.email, password = E2E_USER.password) {
  await page.goto('/auth')
  // The auth page has no <label> elements — fields are identified by type.
  await page.locator('input[type="email"]').first().fill(email)
  await page.locator('input[type="password"]').first().fill(password)
  await page.getByRole('button', { name: /sign in/i }).first().click()
  // Wait for navigation into the app.
  await page.waitForLoadState('networkidle').catch(() => {})
}
