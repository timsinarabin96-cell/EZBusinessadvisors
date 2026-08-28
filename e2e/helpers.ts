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

/**
 * Robust duplicate-listing modal handler. The wizard's dup guard can re-render
 * the modal while the test is clicking it (listings accumulate across runs), so
 * we click with force + retry and never let a detached element fail the test.
 * Returns the studio listing URL (with ?listing=) once creation lands.
 */
export async function submitWizardAndGetListing(page: Page, maxWaitMs = 60_000): Promise<string | null> {
  const submitBtn = page.getByRole('button', { name: /Ready — advance to Verify|Create Draft & Start Review/ })
  const dupModal = page.getByRole('button', { name: 'Continue anyway — create new' })
  const matchModal = page.getByRole('button', { name: 'Continue to workflow →' })
  const deadline = Date.now() + maxWaitMs
  let submitClicked = false
  while (Date.now() < deadline) {
    if (page.url().includes('listing=')) {
      return new URL(page.url()).searchParams.get('listing')
    }
    if (await dupModal.isVisible({ timeout: 400 }).catch(() => false)) {
      await dupModal.click({ force: true, timeout: 4000 }).catch(() => {})
      // The modal click triggers creation + navigation; give it a moment, then
      // re-issue the submit click if the modal re-appeared (churn safety).
      await page.waitForTimeout(1500)
      continue
    }
    if (await matchModal.isVisible({ timeout: 400 }).catch(() => false)) {
      await matchModal.click({ force: true, timeout: 4000 }).catch(() => {})
      await page.waitForTimeout(1500)
      continue
    }
    if (!submitClicked && (await submitBtn.isVisible({ timeout: 400 }).catch(() => false))) {
      await submitBtn.click({ force: true, timeout: 4000 }).catch(() => {})
      submitClicked = true
    }
    await page.waitForTimeout(500)
  }
  return page.url().includes('listing=') ? new URL(page.url()).searchParams.get('listing') : null
}
