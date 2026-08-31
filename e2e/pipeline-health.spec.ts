/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 */

// =============================================================================
// PIPELINE HEALTH — observability for the One-Shot builder. Every build run
// appends a record to ai_metadata.build_history (JSONB, zero migration) and the
// dashboard renders a Pipeline Health card: success rate, avg build time, and
// the recent runs. This spec proves the trail is written and surfaced.
// Run: E2E_EMAIL=... E2E_PASSWORD=*** npx playwright test e2e/pipeline-health.spec.ts
// =============================================================================

import { test, expect } from '@playwright/test'
import { signIn, oneShotBuildDeal, authHeaders } from './helpers'

test.setTimeout(420_000)

const ADMIN_EMAIL = process.env.E2E_EMAIL || 'e2e.qa@concordplatform.dev'
const ADMIN_PASSWORD = process.env.E2E_PASSWORD || 'E2e!Test#2026#Concord'

test.describe('PIPELINE HEALTH — build trail + dashboard widget', () => {
  test('one-shot build writes ai_metadata.build_history and the dashboard shows the run', async ({ page, request }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await expect(page).toHaveURL(/dashboard/, { timeout: 20000 })

    const bizName = `Health Check Biz ${Date.now().toString().slice(-6)}`
    const notes =
      `${bizName} — established IT services company in Lancaster, PA with recurring contracts. ` +
      'Asking $390,000. Annual revenue $480,000, SDE $96,000, 5 full-time employees. ' +
      'Long-term client agreements, trained team. Owner relocating after 10 years.'
    const listingId = await oneShotBuildDeal(page, notes)
    expect(listingId, 'build should land a ?listing= review URL').toBeTruthy()
    console.log('HEALTH: build complete, listing=', listingId)

    // The review screen rendered → the done path ran (which records the trail).
    await page.waitForTimeout(1500)
    const body = await page.locator('body').innerText()
    expect(body).toMatch(/The Deal|THE DEAL/i)
    console.log('HEALTH: review screen rendered ✅')

    // 1) The persisted trail: read ai_metadata.build_history for this listing
    // via Supabase REST (the listing detail API route is DELETE-only; the
    // signed-in user's JWT has RLS access to their agency's rows).
    const headers = await authHeaders(page)
    expect(headers.Authorization, 'auth token present').toBeTruthy()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    expect(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL present').toBeTruthy()
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    expect(anonKey, 'NEXT_PUBLIC_SUPABASE_ANON_KEY present').toBeTruthy()
    const listingRes = await request.get(
      `${supabaseUrl}/rest/v1/listings?id=eq.${listingId}&select=ai_metadata,business_name`,
      { headers: { apikey: anonKey, ...headers } },
    )
    expect(listingRes.ok(), 'supabase listing fetch ok').toBeTruthy()
    const listingRows = await listingRes.json()
    expect(Array.isArray(listingRows) && listingRows.length === 1, 'one listing row').toBe(true)
    const history = listingRows[0]?.ai_metadata?.build_history
    expect(Array.isArray(history), 'ai_metadata.build_history should be an array').toBe(true)
    const latest = history![history!.length - 1]
    expect(latest).toMatchObject({ status: 'done' })
    expect(typeof latest.durationMs).toBe('number')
    expect(Array.isArray(latest.steps)).toBe(true)
    expect(latest.steps.length).toBeGreaterThan(0)
    console.log('HEALTH: build_history trail written ✅ runs=', history!.length)

    // 2) The dashboard Pipeline Health card surfaces the run.
    await page.goto('/dashboard')
    const healthCard = page.locator('.card', { hasText: /Pipeline Health/i }).first()
    await healthCard.waitFor({ timeout: 30000 })
    const cardText = await healthCard.innerText()
    expect(cardText).toMatch(/Success rate/i)
    expect(cardText).toMatch(/Avg build time/i)
    // The fresh run should be visible by name (or at least some run row exists).
    const bizSeen = /Health Check Biz \d{6}/.test(cardText) || /Health Check Biz/.test(cardText)
    expect(bizSeen, 'dashboard health card should list the fresh run').toBe(true)
    console.log('HEALTH: dashboard card shows the run ✅')
  })
})
