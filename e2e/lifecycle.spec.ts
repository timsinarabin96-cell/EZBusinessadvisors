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
import { signIn, authHeaders } from './helpers'

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

    // 2. Listing wizard — fill EVERY section like a real broker so the record
    //    reaches publishable readiness (the quality gate rejects thin data).
    await page.goto('/dashboard/listings/new')
    const businessName = `Lifecycle Test ${Date.now().toString().slice(-6)}`
    await page.getByPlaceholder('Private CRM identity').waitFor({ timeout: 20_000 })

    // ── Business section ──
    await page.getByPlaceholder('Private CRM identity').fill(businessName)
    await page.getByPlaceholder('Established recurring-revenue service company').fill('Established recurring-revenue commercial services company')
    await page.getByPlaceholder('Business Services').fill('Business Services')
    await page.getByPlaceholder('Business Services').press('Escape')
    await page.getByPlaceholder(/Greater Philadelphia/).fill('Greater Philadelphia, PA')
    await page.getByPlaceholder(/Greater Philadelphia/).press('Escape')
    await page.getByPlaceholder(/Explain the business model/).fill(
      'A growing business services company with recurring revenue, strong margins, and an experienced team. Serves commercial clients across the region with multi-year contracts, high retention, and clear expansion potential in adjacent verticals.'
    )

    // ── Financials section (money fields are labelled) ──
    await page.getByRole('button', { name: /2 Financials Price, earnings/ }).click()
    await page.getByLabel('Asking price').fill('495000')
    await page.getByLabel('Annual revenue').fill('640000')
    await page.getByLabel('Seller discretionary earnings').fill('118000')

    // ── Operations section ──
    await page.getByRole('button', { name: /3 Operations People, facilities/ }).click()
    await page.getByLabel('Full-time employees').fill('8')
    await page.getByLabel('Competitive advantages').fill('Multi-year client contracts, strong recurring revenue base, experienced management team, established brand in the region.')
    await page.getByLabel('Growth opportunities').fill('Expand into adjacent verticals, add sales capacity, raise prices on legacy clients, open a second location.')
    await page.getByLabel('Facilities and operating footprint').fill('Leased 4,800 sq ft office with dedicated client meeting space, storage, and room to grow.')

    // ── Seller & Deal section ──
    await page.getByRole('button', { name: /4 Seller & Deal Motivation/ }).click()
    await page.getByLabel('Reason for sale').fill('Owner is retiring after 15 years and wants to hand the business to capable new ownership.')
    await page.getByLabel('Transition support').fill('Owner will stay 4 weeks for training and introduce key clients; additional consulting available.')

    // ── Public Preview section (anonymous marketplace content) ──
    await page.getByRole('button', { name: /6 Public Preview Anonymous/ }).click()
    await page.getByLabel('Anonymous public title').fill('Recurring-Revenue Commercial Services Company')
    await page.getByLabel('Public summary').fill(
      'Established business services company with strong recurring revenue, multi-year client contracts, and an experienced team. Ideal for a strategic buyer or an operator looking for a proven platform with clear growth runway.'
    )
    await page.getByLabel('Public highlights — one per line').fill(
      'High percentage of recurring revenue\nMulti-year client contracts\nExperienced management team\nSeller transition support available'
    )

    // Create the draft — the button label changes with readiness: thin data
    // shows "Create Draft & Start Review", a fully-built record (≥70) shows
    // "✓ Ready — advance to Verify". Match either like a human reading the CTA.
    await page.getByRole('button', { name: /Ready — advance to Verify|Create Draft & Start Review/ }).click()
    const dupModal = page.getByRole('button', { name: 'Continue anyway — create new' })
    const matchModal = page.getByRole('button', { name: 'Continue to workflow →' })
    for (let i = 0; i < 40; i++) {
      if (page.url().includes('listing=')) break
      if (await dupModal.isVisible({ timeout: 500 }).catch(() => false)) { await dupModal.click(); break }
      if (await matchModal.isVisible({ timeout: 500 }).catch(() => false)) { await matchModal.click(); break }
      await page.waitForTimeout(750)
    }
    await expect(page).toHaveURL(/\/dashboard\/studio\?.*listing=[0-9a-f-]+/, { timeout: 60_000 })
    const listingId = new URL(page.url()).searchParams.get('listing')
    expect(listingId).toBeTruthy()

    // 3. Publish through the real API (force bypasses seller-approval for the
    //    test identity, but the quality gate + AI risk gate still run; the full
    //    record means readiness is publishable so nothing gets flagged back).
    const pub = await page.request.post('/api/listings/publish', {
      headers: await authHeaders(page),
      data: { listingId, force: true },
    })
    const pubBody = await pub.json()
    expect(pub.ok(), `publish failed: ${JSON.stringify(pubBody)}`).toBeTruthy()
    expect(pubBody.published).toBe(true)
    expect(pubBody.risk).toBeTruthy()
    expect(pubBody.score).toBeGreaterThanOrEqual(70)

    // 4. Public marketplace: listing live → buyer requests confidential details.
    const slugBase = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'business'
    const listingSlug = `${slugBase}-${listingId.slice(0, 8)}`
    await page.goto(`/marketplace/listings/${listingSlug}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await expect(page.getByText('Established business services company with strong recurring revenue').first()).toBeVisible({ timeout: 20_000 })

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
    await page.goto(`/dashboard/studio?phase=sell&listing=${listingId}`)
    await page.getByPlaceholder('Buyer name').waitFor({ timeout: 20_000 })
    await page.getByPlaceholder('Buyer name').fill(BUYER.name)
    await page.getByPlaceholder('Email').fill(BUYER.email)
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
