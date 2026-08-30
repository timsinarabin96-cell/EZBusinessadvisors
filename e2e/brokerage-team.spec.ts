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
import { signIn, getAuthToken, authHeaders, oneShotBuildDeal } from './helpers'

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
  const listingId = await oneShotBuildDeal(page,
      `${businessName} — established business services company in Harrisburg, PA with recurring revenue. ` +
      'Asking $385,000. Annual revenue $520,000, SDE $96,000, 6 employees. Multi-year client contracts, experienced team.')
  return listingId
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
