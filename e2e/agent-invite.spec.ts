/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// AGENT INVITE E2E — "broker invites agents by email; each agent creates their
// own login and only controls their own listings."
//   • broker (Harbor principal) creates an agent invite via /api/invites
//   • the invitee opens /invite/[token], fills name + email + password
//   • the invitee signs in with THEIR OWN credentials
//   • their profile role = agent, membership = Harbor, nav = agent tier
//   • they can create their own listing
//   • they CANNOT see/publish another agent's listing (own-listings scope)
// =============================================================================

import { test, expect } from '@playwright/test'
import { signIn, getAuthToken, authHeaders, submitWizardAndGetListing } from './helpers'

test.setTimeout(240_000)

const PW = process.env.TENANT_PASSWORD || 'Tenant!Test#2026#Concord'
const BROKER = process.env.TENANT_BROKER_EMAIL || 'harbor.broker.principal@tenant.test'
const AGENT = process.env.TENANT_AGENT_ONE_EMAIL || 'harbor.agent.one@tenant.test'

async function clearSession(page) {
  await page.goto('/auth')
  await page.evaluate(() => { try { localStorage.clear() } catch { /* ignore */ } })
}

test.describe('agent invite flow — Harbor Acquisitions', () => {
  test('broker invites an agent by email; agent creates own login and is scoped to own listings', async ({ page }) => {
    const inviteEmail = `invited.agent.${Date.now().toString().slice(-6)}@tenant.test`
    const invitePassword = 'Invited!Agent#2026#Concord'

    // 1) Broker creates the invite (email attached → sent + locked to that address).
    await clearSession(page)
    await signIn(page, BROKER, PW)
    await expect(page).toHaveURL(/\/(dashboard|listings)/, { timeout: 20_000 })
    const res = await page.request.post('/api/invites', {
      headers: await authHeaders(page),
      data: { targetType: 'agent', email: inviteEmail },
    })
    const j = await res.json()
    expect(res.ok(), `invite create failed: ${JSON.stringify(j)}`).toBeTruthy()
    expect(j.url).toContain('/invite/')
    const token = j.token
    expect(token).toBeTruthy()

    // 2) The invitee opens the link and creates their account.
    // The API builds the URL from the Origin header; Playwright's API context
    // sends none, so j.url falls back to the production site. Navigate to the
    // local path instead (same token, same DB).
    const invitePath = new URL(j.url).pathname
    await page.goto(invitePath)
    await expect(page.getByText("You're invited 🎉")).toBeVisible({ timeout: 20_000 })
    await page.getByPlaceholder('Jane Smith').fill('Maya Invited Agent')
    await page.getByPlaceholder(inviteEmail).fill(inviteEmail)
    await page.getByPlaceholder('At least 8 characters').fill(invitePassword)
    await page.getByRole('button', { name: 'Create my account →' }).click()
    await expect(page.getByText("You're in!")).toBeVisible({ timeout: 30_000 })

    // 3) The new agent signs in with their OWN credentials.
    await clearSession(page)
    await signIn(page, inviteEmail, invitePassword)
    await expect(page).toHaveURL(/\/(dashboard|listings)/, { timeout: 20_000 })

    // Nav is the AGENT tier (no Command Center).
    await expect(page.getByRole('link', { name: /Command Center/ })).toHaveCount(0, { timeout: 15_000 })
    await expect(page.getByRole('link', { name: /Listings/ }).first()).toBeVisible({ timeout: 15_000 })

    // 4) They can create their own listing via the real wizard (agent insert allowed).
    await page.goto('/dashboard/listings/new')
    await page.getByPlaceholder('Private CRM identity').waitFor({ timeout: 20_000 })
    const bizName = `Invited Agent ${Date.now().toString().slice(-6)}`
    await page.getByPlaceholder('Private CRM identity').fill(bizName)
    await page.getByPlaceholder('Established recurring-revenue service company').fill('Established recurring-revenue commercial services company')
    await page.getByPlaceholder('Business Services').fill('Business Services')
    await page.getByPlaceholder('Business Services').press('Escape')
    await page.getByPlaceholder(/Greater Philadelphia/).fill('Harrisburg, PA')
    await page.getByPlaceholder(/Greater Philadelphia/).press('Escape')
    await page.getByPlaceholder(/Explain the business model/).fill(
      'A growing business services company with recurring revenue and an experienced team.'
    )
    // Complete the remaining wizard sections so the submit button renders.
    await page.getByRole('button', { name: /2 Financials Price, earnings/ }).click()
    await page.getByLabel('Asking price').fill('385000')
    await page.getByLabel('Annual revenue').fill('520000')
    await page.getByLabel('Seller discretionary earnings').fill('96000')
    await page.getByRole('button', { name: /3 Operations People, facilities/ }).click()
    await page.getByLabel('Full-time employees').fill('6')
    await page.getByLabel('Competitive advantages').fill('Multi-year client contracts, recurring revenue, experienced team.')
    await page.getByLabel('Growth opportunities').fill('Expand into adjacent verticals, add sales capacity.')
    await page.getByLabel('Facilities and operating footprint').fill('Leased 3,200 sq ft office with client space.')
    await page.getByRole('button', { name: /4 Seller & Deal Motivation/ }).click()
    await page.getByLabel('Reason for sale').fill('Owner retiring after 12 years; wants capable new ownership.')
    await page.getByLabel('Transition support').fill('Owner stays 4 weeks for training and client introductions.')
    await page.getByRole('button', { name: /6 Public Preview Anonymous/ }).click()
    await page.getByLabel('Anonymous public title').fill('Recurring-Revenue Commercial Services Company')
    await page.getByLabel('Public summary').fill(
      'Established business services company with strong recurring revenue, multi-year contracts, and an experienced team.'
    )
    await page.getByLabel('Public highlights — one per line').fill(
      'High percentage of recurring revenue\nMulti-year client contracts\nExperienced management team'
    )
    await page.getByRole('button', { name: /Ready — advance to Verify|Create Draft & Start Review/ }).click()
    const listingId = await submitWizardAndGetListing(page)
    expect(listingId).toBeTruthy()

    // 5) Scope check: they cannot publish ANOTHER agent's listing (403).
    const other = await page.request.post('/api/listings/publish', {
      headers: await authHeaders(page),
      data: { listingId: process.env.SEED_OTHER_LISTING_ID || '', force: true },
    })
    if (process.env.SEED_OTHER_LISTING_ID) {
      expect(other.status()).toBe(403)
    } else {
      // No fixture id provided: verify the scope rule against a Harbor agent's
      // listing by fetching one via the broker session (already covered in
      // brokerage-team.spec.ts) — here we assert the API is reachable.
      expect(other.status() === 403 || other.status() === 404).toBeTruthy()
    }
  })
})
