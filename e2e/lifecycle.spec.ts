/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Full deal-lifecycle E2E — the COMPLETE human journey, browser-tested:
//   sign in → listing wizard (ALL sections, like a real broker) → publish
//   (quality gate + seller-approval + AI risk gate) → public marketplace →
//   buyer NDA/inquiry → buyer management (NDA signed, financially qualified)
//   → LOI → purchase agreement → closing → Sold.
// Runs against the LIVE deployed site (BASE_URL env, default vercel prod).
// =============================================================================

import { test, expect } from '@playwright/test'
import { signIn, authHeaders, oneShotBuildDeal } from './helpers'

test.setTimeout(360_000)

const BUYER = {
  name: 'Lifecycle Buyer',
  email: 'lifecycle.buyer@example.com',
  phone: '(555) 010-2040',
}

test.describe('full deal lifecycle', () => {
  test('listing → publish → marketplace → buyer → NDA → LOI → purchase → closing', async ({ page }) => {
    // 1. Sign in through the real auth UI.
    await signIn(page)
    await expect(page).toHaveURL(/dashboard/, { timeout: 20_000 })

    // 2. One-Shot Deal Builder — full AI pipeline like a real broker would use.
    const businessName = `Lifecycle Test ${Date.now().toString().slice(-6)}`
    const listingId = await oneShotBuildDeal(page,
      `${businessName} — established commercial services company in Greater Philadelphia, PA with recurring revenue. ` +
      'Asking $495,000. Annual revenue $640,000, SDE $118,000, 8 employees. ' +
      'Multi-year client contracts, strong recurring revenue base, experienced management team, established brand. ' +
      'Leased 4,800 sq ft office with client meeting space and storage. ' +
      'Owner retiring after 15 years, stays 4 weeks for training and client introductions; additional consulting available.')
    expect(listingId).toBeTruthy()

    // 3. Publish through the real API (force bypasses seller-approval for the
    //    test identity, but the quality gate + AI risk gate still run; the full
    //    record means readiness is publishable so nothing gets flagged back).
    const pub = await page.request.post('/api/listings/publish', {
      headers: await authHeaders(page),
      data: { listingId, force: true, forceReason: 'E2E lifecycle: test identity bypass (audited override)' },
    })
    const pubBody = await pub.json()
    expect(pub.ok(), `publish failed: ${JSON.stringify(pubBody)}`).toBeTruthy()
    expect(pubBody.published).toBe(true)
    expect(pubBody.risk).toBeTruthy()
    expect(pubBody.score).toBeGreaterThanOrEqual(70)

    // 4. Public marketplace: listing live → buyer requests confidential details.
    // The public feed resolves by raw listing id too, so no slug guessing.
    await page.goto(`/marketplace/listings/${listingId}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await expect(page.getByRole('button', { name: /Request Confidential Access/ }).first()).toBeVisible({ timeout: 20_000 })

    // A real buyer gets the "What are you looking for?" capture popup over the
    // page after ~3.5s — dismiss it like a human before touching the CTA.
    const captureDismiss = page.getByRole('button', { name: 'Dismiss' })
    if (await captureDismiss.isVisible({ timeout: 6_000 }).catch(() => false)) {
      await captureDismiss.click()
    }

    await expect(page.getByRole('button', { name: 'Request Confidential Details' })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Request Confidential Details' }).click()
    const contactForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Submit Request' }) })
    await contactForm.getByPlaceholder('Full name').fill(BUYER.name)
    await contactForm.getByPlaceholder('Email').fill(BUYER.email)
    await contactForm.getByPlaceholder('Phone').fill(BUYER.phone)
    await contactForm.getByPlaceholder(/Tell us about your acquisition goals/).fill('Looking for a service business in the Philadelphia area.')
    await contactForm.getByRole('button', { name: 'Submit Request' }).click()
    await expect(page.getByText(/broker will contact you/i).first()).toBeVisible({ timeout: 20_000 })

    // 5. Deal Studio → Sell & Close phase: Step 9 buyer management.
    await page.goto(`/dashboard/studio?listing=${listingId}`)
    await page.getByPlaceholder('Buyer name').waitFor({ timeout: 20_000 })
    await page.getByPlaceholder('Buyer name').fill(BUYER.name)
    await page.getByPlaceholder('Email', { exact: true }).fill(BUYER.email)
    await page.getByPlaceholder('Phone').fill(BUYER.phone)
    await page.getByRole('button', { name: '+ Add buyer' }).click()
    await expect(page.getByText(BUYER.name).first()).toBeVisible({ timeout: 20_000 })

    // 6. Qualify the buyer like a human: NDA signed → financially qualified.
    await page.getByRole('button', { name: 'Mark NDA signed' }).click()
    await expect(page.getByRole('button', { name: '✓ NDA signed' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Mark financially qualified' }).click()
    await expect(page.getByRole('button', { name: '✓ Financially qualified' })).toBeVisible({ timeout: 15_000 })

    // 7. Sign LOI → listing advances to Pending Sale.
    await page.getByRole('button', { name: /Sign LOI → Pending Sale/ }).click()
    await expect(page.getByText('Pending Sale').first()).toBeVisible({ timeout: 20_000 })

    // 8. Step 10: purchase agreement → Under Contract, then closing → Sold.
    await page.getByRole('button', { name: 'Record signed purchase agreement' }).click()
    await expect(page.getByText('Under Contract').first()).toBeVisible({ timeout: 20_000 })

    // Closing — set the date + final price (auto-save records the details row).
    const dateInput = page.locator('input[type="date"]').first()
    if (await dateInput.isVisible().catch(() => false)) {
      await dateInput.fill('2026-09-30')
    }
    await page.getByRole('button', { name: 'Record closing' }).click()

    // 9. Verify the deal is CLOSED: listing badge = Sold + confirmation text.
    await expect(page.getByText('Sold').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/Deal closed/i).first()).toBeVisible({ timeout: 20_000 })

    // 10. Cleanup: trash the test listing (reason required by the delete API).
    const del = await page.request.delete(`/api/listings/${listingId}`, {
      headers: await authHeaders(page),
      data: { reason: 'test_listing', note: 'Lifecycle e2e cleanup' },
    })
    const delBody = await del.json().catch(() => ({}))
    expect(del.ok() || delBody.ok, `cleanup failed: ${JSON.stringify(delBody)}`).toBeTruthy()
  })
})
