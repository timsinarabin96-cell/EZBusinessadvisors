/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Full-journey E2E — the complete marketplace loop, browser-tested:
//   sign in → listing wizard (studio) → publish (quality gate + AI risk gate)
//   → appears on the public marketplace → buyer NDA/inquiry → cleanup.
// Runs against the LIVE deployed site (BASE_URL env, default vercel prod).
// =============================================================================

import { test, expect } from '@playwright/test'
import { signIn, authHeaders, E2E_USER, oneShotBuildDeal } from './helpers'

// Full journey spans sign-in + wizard + publish + marketplace + inquiry —
// needs more than the default 45s.
test.setTimeout(150_000)

const BUYER = {
  name: 'Journey Buyer',
  email: 'journey.buyer@example.com',
  phone: '(555) 010-2030',
}

test.describe('full journey', () => {
  test('wizard → publish → marketplace → buyer inquiry', async ({ page }) => {
    // 1. Sign in through the real auth UI.
    await signIn(page)
    await expect(page).toHaveURL(/dashboard/, { timeout: 20_000 })

    // 2. One-Shot Deal Builder: paste notes → Build Entire Deal → review.
    const businessName = `Journey Test ${Date.now().toString().slice(-6)}`
    const listingId = await oneShotBuildDeal(page,
      `${businessName} — established business services company in Greater Philadelphia, PA with recurring revenue. ` +
      'Asking $495,000. Annual revenue $640,000, SDE $118,000, 8 employees. Multi-year client contracts, strong margins, experienced team. ' +
      'Leased 4,800 sq ft office. Owner retiring after 15 years, stays 4 weeks for transition.')
    expect(listingId).toBeTruthy()

    // 3. Publish through the real API (force bypasses readiness for thin test
    //    data, but still exercises the quality gate + NEW AI risk gate).
    const pub = await page.request.post('/api/listings/publish', {
      headers: await authHeaders(page),
      data: { listingId, force: true },
    })
    const pubBody = await pub.json()
    expect(pub.ok(), `publish failed: ${JSON.stringify(pubBody)}`).toBeTruthy()
    expect(pubBody.published).toBe(true)
    // AI risk gate is wired into publish — response carries the risk report.
    expect(pubBody.risk).toBeTruthy()
    expect(typeof pubBody.risk.score).toBe('number')

    // 4. Public marketplace: the listing is live and visible. The detail page
    //    resolves by slug (matches syncPublicListingRow's deterministic format)
    //    and titles itself with the marketing headline, not the business name.
    await page.goto(`/marketplace/listings/${listingId}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await expect(page.getByRole('button', { name: /Request Confidential Access/ }).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Request Confidential Details' })).toBeVisible()

    // 5. Buyer NDA / inquiry: request confidential details → form → success.
    //    Scope to the contact form (the page has other email inputs).
    await page.getByRole('button', { name: 'Request Confidential Details' }).click()
    const contactForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Submit Request' }) })
    await contactForm.getByPlaceholder('Full name').fill(BUYER.name)
    await contactForm.getByPlaceholder('Email').fill(BUYER.email)
    await contactForm.getByPlaceholder('Phone').fill(BUYER.phone)
    await contactForm.getByPlaceholder(/Tell us about your acquisition goals/).fill('Looking for a service business in the Philadelphia area.')
    await contactForm.getByRole('button', { name: 'Submit Request' }).click()
    await expect(page.getByText(/broker will contact you/i).first()).toBeVisible({ timeout: 20_000 })

    // 6. Cleanup: remove the test listing (server-side delete — reason required).
    const del = await page.request.delete(`/api/listings/${listingId}`, {
      headers: await authHeaders(page),
      data: { reason: 'test_listing', note: 'Journey e2e cleanup' },
    })
    const delBody = await del.json().catch(() => ({}))
    expect(del.ok() || delBody.ok, `cleanup failed: ${JSON.stringify(delBody)}`).toBeTruthy()
  })
})
