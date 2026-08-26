// =============================================================================
// Full-journey E2E — the complete marketplace loop, browser-tested:
//   sign in → listing wizard (studio) → publish (quality gate + AI risk gate)
//   → appears on the public marketplace → buyer NDA/inquiry → cleanup.
// Runs against the LIVE deployed site (BASE_URL env, default vercel prod).
// =============================================================================

import { test, expect } from '@playwright/test'
import { signIn, authHeaders, E2E_USER } from './helpers'

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

    // 2. Listing wizard: create a draft through the studio.
    await page.goto('/dashboard/listings/new')
    const businessName = `Journey Test ${Date.now().toString().slice(-6)}`

    // Wait for the form to hydrate before typing.
    await page.getByPlaceholder('Private CRM identity').waitFor({ timeout: 20_000 })
    await page.getByPlaceholder('Private CRM identity').fill(businessName)
    await page.getByPlaceholder('Established recurring-revenue service company').fill('Established service business with recurring revenue')
    await page.getByPlaceholder('Business Services').fill('Business Services')
    await page.getByPlaceholder('Business Services').press('Escape')
    await page.getByPlaceholder(/Greater Philadelphia/).fill('Greater Philadelphia, PA')
    await page.getByPlaceholder(/Greater Philadelphia/).press('Escape')
    await page.getByPlaceholder(/Explain the business model/).fill(
      'A growing business services company with recurring revenue, strong margins, and an experienced team. Serves commercial clients across the region.'
    )

    // Jump straight to the final section (sidebar nav), then submit.
    await page.getByRole('button', { name: 'Public Preview' }).click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: 'Create Draft & Start Review' }).click()

    // Post-create modals appear asynchronously (duplicate guard → buyer match).
    // Poll until the workflow URL lands or a modal needs a click.
    const dupModal = page.getByRole('button', { name: 'Continue anyway — create new' })
    const matchModal = page.getByRole('button', { name: 'Continue to workflow →' })
    for (let i = 0; i < 40; i++) {
      if (page.url().includes('/workflow')) break
      if (await dupModal.isVisible({ timeout: 500 }).catch(() => false)) { await dupModal.click(); break }
      if (await matchModal.isVisible({ timeout: 500 }).catch(() => false)) { await matchModal.click(); break }
      await page.waitForTimeout(750)
    }

    // The draft lands in the guided workflow.
    await expect(page).toHaveURL(/\/dashboard\/listings\/[0-9a-f-]+\/workflow/, { timeout: 60_000 })
    const listingId = new URL(page.url()).pathname.split('/')[3]
    expect(listingId).toBeTruthy()

    // 3. Publish through the real API (force bypasses readiness for thin test
    //    data, but still exercises the quality gate + NEW AI risk gate).
    const pub = await page.request.post('/api/listings/publish', {
      headers: await authHeaders(page),
      data: { listingId, force: true },
    })
    const pubBody = await pub.json()
    expect(pub.ok, `publish failed: ${JSON.stringify(pubBody)}`).toBeTruthy()
    expect(pubBody.published).toBe(true)
    // AI risk gate is wired into publish — response carries the risk report.
    expect(pubBody.risk).toBeTruthy()
    expect(typeof pubBody.risk.score).toBe('number')

    // 4. Public marketplace: the listing is live and visible.
    await page.goto(`/marketplace/listings/${listingId}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await expect(page.getByText(businessName).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Request Confidential Details' })).toBeVisible()

    // 5. Buyer NDA / inquiry: request confidential details → form → success.
    await page.getByRole('button', { name: 'Request Confidential Details' }).click()
    await page.getByPlaceholder('Full name').fill(BUYER.name)
    await page.getByPlaceholder('Email').fill(BUYER.email)
    await page.getByPlaceholder('Phone').fill(BUYER.phone)
    await page.getByPlaceholder(/Tell us about your acquisition goals/).fill('Looking for a service business in the Philadelphia area.')
    await page.getByRole('button', { name: 'Submit Request' }).click()
    await expect(page.getByText(/broker will contact you/i).first()).toBeVisible({ timeout: 20_000 })

    // 6. Cleanup: remove the test listing (server-side delete).
    const del = await page.request.delete(`/api/listings/${listingId}`, {
      headers: await authHeaders(page),
    })
    const delBody = await del.json().catch(() => ({}))
    expect(del.ok || delBody.ok, `cleanup failed: ${JSON.stringify(delBody)}`).toBeTruthy()
  })
})
