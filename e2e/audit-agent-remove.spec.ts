/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 */

// =============================================================================
// TARGETED AUDIT — the two things the boss called out explicitly:
//   1. AGENT ADD + REMOVE  — agency admin can add a member and REMOVE them
//   2. AUTO-SAVE + COMMAS  — One-Shot build auto-saves a draft listing and the
//      review screen shows comma-formatted numbers (900,000,000 → $900,000,000)
// Run: E2E_EMAIL=... E2E_PASSWORD=... npx playwright test e2e/audit-agent-remove.spec.ts
// =============================================================================

import { test, expect } from '@playwright/test'
import { signIn } from './helpers'

test.setTimeout(360_000)

const ADMIN_EMAIL = process.env.E2E_EMAIL || 'e2e.qa@concordplatform.dev'
const ADMIN_PASSWORD = process.env.E2E_PASSWORD || 'E2e!Test#2026#Concord'

/** Env is pre-loaded into process.env by playwright.config.ts (it reads .env.local). */
function envGet(k: string): string | undefined {
  return process.env[k]
}

test.describe('AUDIT — agent add/remove + auto-save with commas', () => {
  // ── 1) AGENT ADD + REMOVE via Agency Admin ──────────────────────────────
  test('agency admin: add a member, then remove them', async ({ page }) => {
    const { createClient } = await import('@supabase/supabase-js')
    const admin = createClient(envGet('NEXT_PUBLIC_SUPABASE_URL')!, envGet('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const email = `audit.agent.${Date.now().toString().slice(-6)}@concordplatform.dev`
    const { data: u, error: uerr } = await admin.auth.admin.createUser({
      email,
      password: 'Audit!Agent#2026',
      email_confirm: true,
      user_metadata: { full_name: 'Audit Agent' },
    })
    expect(uerr, `create audit user failed: ${uerr?.message}`).toBeNull()
    const profileId = u!.user.id
    // agency_members FKs to profiles — create the profile row like the seed does.
    const { error: perr } = await admin.from('profiles').upsert({
      id: profileId,
      email,
      full_name: 'Audit Agent',
      role: 'associate',
      status: 'active',
    }, { onConflict: 'id' })
    expect(perr, `profile upsert failed: ${perr?.message}`).toBeNull()
    console.log('AUDIT: created disposable agent', email, profileId)

    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await page.goto('/agencies')
    await page.waitForLoadState('domcontentloaded')

    // Select the QA-owned agency (the seed-created "QA Test Brokerage" row).
    const qaBtn = page.locator('button', { hasText: 'QA Test Brokerage' }).first()
    await qaBtn.waitFor({ state: 'visible', timeout: 20000 })
    await qaBtn.click()
    await page.waitForTimeout(1200)
    // Branding name input must reflect the selected agency.
    const brandingName = page.locator('label:has-text("Agency Name") + input')
    await expect(brandingName).toHaveValue(/QA Test Brokerage/, { timeout: 10000 })

    // Add member.
    await page.getByRole('button', { name: '+ Add Member' }).click()
    await page.locator('input[placeholder="uuid"]').fill(profileId)
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    // Row shows the first 8 chars of the profile id.
    const truncated = profileId.slice(0, 8)
    await expect(page.getByText(truncated).first()).toBeVisible({ timeout: 15000 })
    console.log('AUDIT: member ADDED and visible in team list')

    // Remove the same member via the 🗑 button in their row.
    const rowEl = page.locator('div').filter({ has: page.locator(`span:has-text("${truncated}")`) }).last()
    await rowEl.getByRole('button', { name: '🗑' }).click()
    await page.waitForTimeout(2500)
    const stillThere = await page.getByText(truncated).first().isVisible({ timeout: 3000 }).catch(() => false)
    expect(stillThere, 'removed member should no longer appear in team list').toBe(false)
    console.log('AUDIT: member REMOVED — no longer in team list')

    // Cleanup: delete the disposable auth user.
    await admin.auth.admin.deleteUser(profileId).catch(() => {})
    console.log('AUDIT: disposable agent deleted')
  })

  // ── 2) AUTO-SAVE + COMMA-FORMATTED NUMBERS ──────────────────────────────
  test('one-shot build: draft auto-saved + review shows $900,000,000 with commas', async ({ page }) => {
    const bizName = `Audit Comma Biz ${Date.now().toString().slice(-6)}`
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await expect(page).toHaveURL(/dashboard/, { timeout: 20000 })

    await page.goto('/dashboard/listings/new')
    await page.getByPlaceholder(/Paste anything/).waitFor({ timeout: 30000 })
    const notes =
      `${bizName} — industrial services company in Harrisburg, PA with strong recurring revenue. ` +
      'Asking $900,000,000. Annual revenue $1,250,000, SDE $310,000, 9 full-time employees. ' +
      'Long-term contracts, trained team, leased facility. Owner retiring after 15 years, stays 30 days for transition.'
    await page.getByPlaceholder(/Paste anything/).fill(notes)
    await page.getByRole('button', { name: /Build Entire Deal/ }).click()

    // Wait for the streaming pipeline to land on the review screen.
    const deadline = Date.now() + 240_000
    let listingId: string | null = null
    while (Date.now() < deadline) {
      if (page.url().includes('listing=')) {
        listingId = new URL(page.url()).searchParams.get('listing')
        break
      }
      await page.waitForTimeout(1500)
    }
    expect(listingId, 'build should land a ?listing= review URL (draft auto-created)').toBeTruthy()
    console.log('AUDIT: draft listing auto-created, id=', listingId)

    // Review screen must render the deal record with COMMA-formatted figures.
    await page.waitForTimeout(1500)
    const body = await page.locator('body').innerText()
    expect(body).toMatch(/The Deal|Approve & Go Live|THE DEAL/i)
    console.log('AUDIT: review screen rendered')

    // Assert comma formatting — the exact comma string must be present.
    const withCommas = body.includes('$900,000,000') || body.includes('900,000,000')
    const rawNoCommas = /900000000/.test(body)
    expect(withCommas, `review should show comma-formatted 900,000,000 (raw found: ${rawNoCommas})`).toBe(true)
    console.log('AUDIT: ✅ comma formatting confirmed — $900,000,000 shown with commas')

    // Auto-save proof: the draft appears in the dashboard listings (real route
    // is /listings — the AppShell "Listings" nav target).
    await page.goto('/listings')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2500)
    const dash = await page.locator('body').innerText()
    expect(dash).toMatch(new RegExp(bizName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
    console.log('AUDIT: ✅ auto-saved draft listed on dashboard')
  })
})
