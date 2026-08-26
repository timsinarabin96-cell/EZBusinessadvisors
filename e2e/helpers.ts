/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

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

/**
 * Supabase stores the session in localStorage (not cookies), so API routes
 * (which read the Bearer token from the Authorization header) need the token
 * passed explicitly when calling from a Playwright APIRequestContext.
 */
export async function getAuthToken(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.includes('auth-token'))
    if (!key) return null
    try {
      const raw = localStorage.getItem(key)
      const parsed = raw ? JSON.parse(raw) : null
      return parsed?.access_token || null
    } catch {
      return null
    }
  })
}

export async function authHeaders(page: Page): Promise<Record<string, string>> {
  const token = await getAuthToken(page)
  return token ? { Authorization: `Bearer ${token}` } : {}
}
