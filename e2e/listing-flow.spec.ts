/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 */

// =============================================================================
// LISTING-FLOW SWEEP — the complete seller journey, end to end:
//   1. Public /marketplace/sell form (free plan, attestation) → draft listing
//      lands in the broker review queue WITH every field intact (industry,
//      location, revenue, asking price — the fields that used to get dropped)
//      + portal token + order record.
//   2. Broker approves in the review queue.
//   3. Broker publishes (Go Live) → public_listings row synced.
//   4. Listing appears on the marketplace within the feed-cache window.
//   5. Seller portal (/seller/<token>) renders with the right status.
// Run: E2E_EMAIL=... E2E_PASSWORD=*** npx playwright test e2e/listing-flow.spec.ts
// =============================================================================

import { test, expect } from '@playwright/test'
import { signIn, authHeaders } from './helpers'

test.setTimeout(300_000)

const ADMIN_EMAIL = process.env.E2E_EMAIL || 'e2e.qa@concordplatform.dev'
const ADMIN_PASSWORD = process.env.E2E_PASSWORD || 'E2e!Test#2026#Concord'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const hasAdminEnv = Boolean(SUPABASE_URL && SERVICE_KEY)
test.skip(!hasAdminEnv, 'listing-flow requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')

const svcHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }

/** Fetch a single listing row by id with the service key (bypasses RLS). */
async function fetchListingRow(id: string): Promise<Record<string, any> | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/listings?id=eq.${id}&select=*`, { headers: svcHeaders })
  if (!res.ok) throw new Error(`listings fetch ${res.status}: ${await res.text()}`)
  const rows = await res.json()
  return rows?.[0] || null
}

test.describe('LISTING FLOW — sell form → review → publish → marketplace → seller portal', () => {
  test('full seller journey works end to end', async ({ page, request }) => {
    const stamp = Date.now().toString().slice(-6)
    const bizName = `Flow Sweep Biz ${stamp}`
    const sellerEmail = `flow.seller.${stamp}@tenant.test`

    // ── 1) SELLER: public sell form (no login) ─────────────────────────────
    await page.goto('/marketplace/sell')
    await page.getByLabel('Full Name *').waitFor({ timeout: 30000 })
    await page.getByLabel('Full Name *').fill('Flow Sweep Seller')
    await page.getByLabel('Email *').fill(sellerEmail)
    await page.getByLabel('Phone').fill('7175551234')
    await page.getByLabel('Business Name').fill(bizName)
    await page.getByLabel('Industry').selectOption('Cleaning')
    await page.getByPlaceholder(/Type a city/i).fill('Harrisburg, PA')
    await page.getByLabel('Timeline to sell').selectOption('3-6 months')
    await page.getByPlaceholder(/Full-time count/i).fill('12')
    await page.getByPlaceholder(/e.g. 500,000/i).fill('520,000')
    await page.getByPlaceholder(/e.g. 1,200,000/i).fill('650,000')
    await page.getByLabel('Anything else?').fill('Sweep: verifying the listing lands complete with every field.')

    // Attestation + submit (free plan is preselected).
    await page.locator('form input[type="checkbox"]').check()
    await page.getByRole('button', { name: /Submit My Free Listing/i }).click()
    await page.getByText(/Thank You/i).waitFor({ timeout: 30000 })
    console.log('SELL: form submitted, thank-you screen ✅')

    // ── 2) VERIFY: draft listing landed complete + order + portal token ────
    // Find it by business name + intake source (service key, RLS bypass).
    const findRes = await fetch(
      `${SUPABASE_URL}/rest/v1/listings?business_name=eq.${encodeURIComponent(bizName)}&select=id,business_name,status,industry,location_general,annual_revenue,asking_price,portal_token,attestation_accepted_at,confidentiality_level,intake_source,owner_email,review_stage`,
      { headers: svcHeaders },
    )
    expect(findRes.ok, 'find listing').toBeTruthy()
    const found = await findRes.json()
    expect(Array.isArray(found) && found.length === 1, `exactly one listing for ${bizName}`).toBe(true)
    const listing = found[0]
    const listingId = listing.id
    expect(listing.status).toBe('draft')
    expect(listing.intake_source).toBe('seller_self_service')
    expect(listing.industry).toBe('Cleaning')
    expect(listing.location_general).toBe('Harrisburg, PA')
    expect(Number(listing.annual_revenue)).toBe(520000)
    expect(Number(listing.asking_price)).toBe(650000)
    expect(listing.portal_token).toBeTruthy()
    expect(listing.attestation_accepted_at).toBeTruthy()
    expect(listing.owner_email).toBe(sellerEmail)
    console.log('VERIFY: draft complete — industry/location/revenue/price/portal/attestation all intact ✅')

    // Order record exists for the listing.
    const orderRes = await fetch(
      `${SUPABASE_URL}/rest/v1/seller_listing_orders?listing_id=eq.${listingId}&select=listing_id,plan_code,status,amount_cents`,
      { headers: svcHeaders },
    )
    expect(orderRes.ok).toBeTruthy()
    const orders = await orderRes.json()
    expect(Array.isArray(orders) && orders.length >= 1, 'seller order recorded').toBe(true)
    expect(orders[0].plan_code).toBe('free')
    console.log('VERIFY: free-plan order recorded ✅')

    // ── 3) BROKER: approve in the review queue ─────────────────────────────
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await expect(page).toHaveURL(/dashboard/, { timeout: 20000 })
    const headers = await authHeaders(page)
    expect(headers.Authorization).toBeTruthy()

    const approveRes = await request.post('/api/listings/review', {
      headers,
      data: { listingId, action: 'approve', notes: 'listing-flow sweep approval' },
    })
    expect(approveRes.ok(), 'broker approve').toBeTruthy()
    const approvedRow = await fetchListingRow(listingId)
    expect(approvedRow?.status).toBe('approved')
    expect(approvedRow?.review_stage).toBe('approved')
    console.log('BROKER: approved in review queue ✅')

    // ── 4) BROKER: publish (Go Live) — force for the sweep (readiness will
    //       be low with no docs; a real broker would force + get auto-flagged,
    //       exactly like the studio Go Live path). ─────────────────────────
    const publishRes = await request.post('/api/listings/publish', {
      headers,
      data: { listingId, force: true },
    })
    const pubJson = await publishRes.json().catch(() => ({}))
    expect(publishRes.ok() || (publishRes.status() === 422 && pubJson.blocked === false), `publish: ${JSON.stringify(pubJson).slice(0, 200)}`).toBe(true)
    const liveRow = await fetchListingRow(listingId)
    expect(liveRow?.status).toBe('active')
    console.log('BROKER: published — listing active ✅')

    // ── 5) MARKETPLACE: appears within the feed-cache window (30s TTL) ─────
    await page.waitForTimeout(32_000) // let the 30s feed cache expire
    await page.goto('/marketplace/listings')
    await page.waitForLoadState('domcontentloaded')
    // Search the page for the business name (grid is server-rendered).
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(bizName)
    console.log('MARKETPLACE: listing visible after cache window ✅')

    // ── 6) SELLER PORTAL: token link renders the status ────────────────────
    const portalUrl = `/seller/${listing.portal_token}`
    await page.goto(portalUrl)
    await page.getByText(bizName).first().waitFor({ timeout: 30000 })
    const portalText = await page.locator('body').innerText()
    expect(portalText).toMatch(/Live|Active|Current status/i)
    console.log('PORTAL: seller portal renders with status ✅')

    // ── 7) PUBLIC DETAIL PAGE: the conversion page renders for this listing ─
    const detailRes = await request.get(`/marketplace/listings/${listingId}`, { headers: {} })
    expect(detailRes.ok()).toBe(true)
    const detailHtml = await detailRes.text()
    expect(detailHtml).toContain(bizName)
    console.log('DETAIL: public detail page renders ✅')
  })
})
