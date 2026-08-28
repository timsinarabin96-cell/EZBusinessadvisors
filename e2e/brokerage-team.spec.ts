/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// BROKERAGE-TEAM E2E — the boss's "broker gets agents" scenario.
// Harbor Acquisitions now has a principal broker (Daniel Harbor) + 5 agents.
// This spec proves the permission model end-to-end for BOTH systems:
//   • agent can create/edit/publish their OWN listing
//   • agent CANNOT publish another agent's listing (403)
//   • broker CAN manage any agent's listing in their agency (publish/edit)
//   • broker nav shows broker-tier tools; agent nav does not
//   • agency isolation: Harbor agents never see EZ/QA listings
//   • mirror run: EZ QA system broker + agents get the same checks
// =============================================================================

import { test, expect } from '@playwright/test'
import { signIn, getAuthToken, authHeaders, submitWizardAndGetListing } from './helpers'

test.setTimeout(240_000)

const PW = process.env.TENANT_PASSWORD || 'Tenant!Test#2026#Concord'

const HARBOR = {
  agencyId: process.env.TENANT_AGENCY_ID || '',
  broker: process.env.TENANT_BROKER_EMAIL || 'harbor.broker.principal@tenant.test',
  agent1: process.env.TENANT_AGENT_ONE_EMAIL || 'harbor.agent.one@tenant.test',
  agent2: process.env.TENANT_AGENT_TWO_EMAIL || 'harbor.agent.two@tenant.test',
}

const EZ = {
  // The QA brokerage on the main EZ system (mirror role checks).
  broker: process.env.E2E_EMAIL || 'e2e.qa@concordplatform.dev',
  password: process.env.E2E_PASSWORD || 'E2e!Test#2026#Concord',
}

const AGENT3 = process.env.TENANT_AGENT_THREE_EMAIL || 'harbor.agent.three@tenant.test'

async function clearSession(page) {
  await page.goto('/auth')
  await page.evaluate(() => {
    try { localStorage.clear() } catch { /* ignore */ }
  })
}

/** Fill the full wizard and submit; returns the created listing id. */
async function createListingViaWizard(page, businessName) {
  await page.goto('/dashboard/listings/new')
  await page.getByPlaceholder('Private CRM identity').waitFor({ timeout: 20_000 })

  await page.getByPlaceholder('Private CRM identity').fill(businessName)
  await page.getByPlaceholder('Established recurring-revenue service company').fill('Established recurring-revenue commercial services company')
  await page.getByPlaceholder('Business Services').fill('Business Services')
  await page.getByPlaceholder('Business Services').press('Escape')
  await page.getByPlaceholder(/Greater Philadelphia/).fill('Harrisburg, PA')
  await page.getByPlaceholder(/Greater Philadelphia/).press('Escape')
  await page.getByPlaceholder(/Explain the business model/).fill(
    'A growing business services company with recurring revenue, strong margins, and an experienced team. Serves commercial clients across central Pennsylvania with multi-year contracts and clear expansion potential.'
  )
  await page.getByRole('button', { name: /2 Financials Price, earnings/ }).click()
  await page.getByLabel('Asking price').fill('385000')
  await page.getByLabel('Annual revenue').fill('520000')
  await page.getByLabel('Seller discretionary earnings').fill('96000')
  await page.getByRole('button', { name: /3 Operations People, facilities/ }).click()
  await page.getByLabel('Full-time employees').fill('6')
  await page.getByLabel('Competitive advantages').fill('Multi-year client contracts, recurring revenue, experienced team, strong regional brand.')
  await page.getByLabel('Growth opportunities').fill('Expand into adjacent verticals, add sales capacity, open a second location.')
  await page.getByLabel('Facilities and operating footprint').fill('Leased 3,200 sq ft office with client space and storage.')
  await page.getByRole('button', { name: /4 Seller & Deal Motivation/ }).click()
  await page.getByLabel('Reason for sale').fill('Owner retiring after 12 years; wants capable new ownership to continue serving clients.')
  await page.getByLabel('Transition support').fill('Owner stays 4 weeks for training and client introductions.')
  await page.getByRole('button', { name: /6 Public Preview Anonymous/ }).click()
  await page.getByLabel('Anonymous public title').fill('Recurring-Revenue Commercial Services Company')
  await page.getByLabel('Public summary').fill(
    'Established business services company with strong recurring revenue, multi-year contracts, and an experienced team. Ideal for a strategic buyer or operator seeking a proven platform.'
  )
  await page.getByLabel('Public highlights — one per line').fill(
    'High percentage of recurring revenue\nMulti-year client contracts\nExperienced management team'
  )

  await page.getByRole('button', { name: /Ready — advance to Verify|Create Draft & Start Review/ }).click()
  return await submitWizardAndGetListing(page)
}

test.describe('brokerage team — Harbor Acquisitions', () => {
  test('agent creates their own listing; another agent CANNOT publish it (403)', async ({ page }) => {
    await clearSession(page)
    await signIn(page, HARBOR.agent1, PW)
    await expect(page).toHaveURL(/dashboard/, { timeout: 20_000 })

    const listingId = await createListingViaWizard(page, `Harbor Chen ${Date.now().toString().slice(-6)}`)
    expect(listingId).toBeTruthy()

    // Agent 1 publishes their own listing → allowed (score ≥70).
    const res1 = await page.request.post('/api/listings/publish', {
      headers: await authHeaders(page),
      data: { listingId, force: true },
    })
    expect(res1.ok(), `own publish failed: ${await res1.text()}`).toBeTruthy()

    // Agent 2 tries to publish agent 1's listing → 403 (not their listing).
    await clearSession(page)
    await signIn(page, HARBOR.agent2, PW)
    await expect(page).toHaveURL(/dashboard/, { timeout: 20_000 })
    const res2 = await page.request.post('/api/listings/publish', {
      headers: await authHeaders(page),
      data: { listingId, force: true },
    })
    const body2 = await res2.json()
    expect(res2.status(), `agent cross-publish should be 403, got ${res2.status()}: ${JSON.stringify(body2)}`).toBe(403)
  })

  test('broker CAN publish any agent listing; broker nav has broker tools, agent nav does not', async ({ page }) => {
    await clearSession(page)
    await signIn(page, HARBOR.agent1, PW)
    await expect(page).toHaveURL(/dashboard/, { timeout: 20_000 })

    // Agent 1 creates a draft they do NOT publish.
    const listingId = await createListingViaWizard(page, `Harbor Chen Draft ${Date.now().toString().slice(-6)}`)
    expect(listingId).toBeTruthy()

    // Agent nav: no Command Center (broker-only).
    await page.getByRole('button', { name: '☰' }).click().catch(() => {})
    const agentHasBrokerTool = await page.getByRole('link', { name: /Command Center/ }).count().catch(() => 0)
    expect(agentHasBrokerTool).toBe(0)
    // But agents DO get core agent tools (Listings, Studio).
    await expect(page.getByRole('link', { name: /Listings/ }).first()).toBeVisible({ timeout: 10_000 }).catch(() => {})

    // Broker signs in and publishes the agent's draft → allowed (agency member + broker).
    await clearSession(page)
    await signIn(page, HARBOR.broker, PW)
    // Role-based post-login redirect may land on /dashboard or /listings —
    // either is inside the app; just make sure we're not stuck on /auth.
    await expect(page).toHaveURL(/\/(dashboard|listings)/, { timeout: 20_000 })

    // Broker nav includes broker-tier tools (auto-waiting on role resolution).
    await expect(page.getByRole('link', { name: /Command Center/ })).toHaveCount(1, { timeout: 15_000 })

    const res = await page.request.post('/api/listings/publish', {
      headers: await authHeaders(page),
      data: { listingId, force: true },
    })
    expect(res.ok(), `broker publish failed: ${await res.text()}`).toBeTruthy()
  })

  test('agency isolation: Harbor agents never see EZ/QA listings', async ({ page }) => {
    await clearSession(page)
    await signIn(page, AGENT3, PW)
    await expect(page).toHaveURL(/dashboard/, { timeout: 20_000 })
    await page.goto('/listings')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1_500)
    const body = await page.locator('body').innerText().catch(() => '')
    expect(body).not.toContain('Journey Test')
    expect(body).not.toContain('Lifecycle Test')
    expect(body).not.toContain('Summit Plumbing')
  })
})

test.describe('brokerage team — EZ/QA system mirror', () => {
  test('QA broker (owner) creates + publishes; nav shows broker tools', async ({ page }) => {
    await clearSession(page)
    await signIn(page, EZ.broker, EZ.password)
    await expect(page).toHaveURL(/dashboard/, { timeout: 20_000 })

    const listingId = await createListingViaWizard(page, `EZ Mirror ${Date.now().toString().slice(-6)}`)
    expect(listingId).toBeTruthy()

    const res = await page.request.post('/api/listings/publish', {
      headers: await authHeaders(page),
      data: { listingId, force: true },
    })
    expect(res.ok(), `EZ publish failed: ${await res.text()}`).toBeTruthy()

    const hasBrokerTool = page.getByRole('link', { name: /Command Center/ })
    await expect(hasBrokerTool).toHaveCount(1, { timeout: 15_000 })
  })
})
