/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 */

// =============================================================================
// CONFIRM-GATE AUDIT — the P1 trust gate: "Approve & Go Live" must be blocked
// until the broker ticks "I confirm the asking price, revenue & earnings are
// correct". AI built it → broker owns it. This spec proves the gate works and
// stays working.
// Run: E2E_EMAIL=... E2E_PASSWORD=*** npx playwright test e2e/confirm-gate.spec.ts
// =============================================================================

import { test, expect } from '@playwright/test'
import { signIn, oneShotBuildDeal } from './helpers'

test.setTimeout(360_000)

const ADMIN_EMAIL = process.env.E2E_EMAIL || 'e2e.qa@concordplatform.dev'
const ADMIN_PASSWORD = process.env.E2E_PASSWORD || 'E2e!Test#2026#Concord'

test.describe('CONFIRM GATE — broker sign-off before Go Live', () => {
  test('one-shot build → Go Live blocked without confirmation → allowed after ticking the gate', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await expect(page).toHaveURL(/dashboard/, { timeout: 20000 })

    const bizName = `Gate Check Biz ${Date.now().toString().slice(-6)}`
    await page.goto('/dashboard/listings/new')
    await page.getByPlaceholder(/Paste anything/).waitFor({ timeout: 30000 })
    const notes =
      `${bizName} — established business services company in Harrisburg, PA with recurring revenue. ` +
      'Asking $450,000. Annual revenue $560,000, SDE $105,000, 7 full-time employees. ' +
      'Multi-year contracts, trained team. Owner retiring after 12 years, stays 30 days for transition.'
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
    expect(listingId, 'build should land a ?listing= review URL').toBeTruthy()
    console.log('GATE: build complete, listing=', listingId)

    await page.waitForTimeout(1500)
    const body = await page.locator('body').innerText()
    expect(body).toMatch(/The Deal|THE DEAL/i)
    console.log('GATE: review screen rendered')

    // The confirm checkbox must be present while the listing is NOT active.
    const gateCheckbox = page.locator('input[type="checkbox"]').filter({ has: page.locator('xpath=..') }).first()
    const gateVisible = await page.getByText(/I confirm the asking price, revenue/i).isVisible({ timeout: 8000 }).catch(() => false)
    expect(gateVisible, 'confirm gate checkbox should be visible on the review screen').toBe(true)
    console.log('GATE: confirm checkbox visible ✅')

    // 1) Click Go Live WITHOUT confirming → must be blocked with an error toast.
    await page.getByRole('button', { name: /Approve & Go Live/ }).click()
    await page.waitForTimeout(2500)
    const toasts = await page.locator('.toast, [class*="toast"]').allInnerTexts().catch(() => [])
    const blocked = toasts.some((t) => /confirm/i.test(t))
    console.log('GATE: blocked toast present:', blocked, '—', JSON.stringify(toasts.slice(0, 2)))
    expect(blocked, 'Go Live without confirmation must be blocked with a toast').toBe(true)

    // The listing must NOT be live yet.
    const afterBlock = await page.locator('body').innerText()
    expect(afterBlock).not.toMatch(/✓ Live on the marketplace/)
    console.log('GATE: listing still not live after blocked attempt ✅')

    // 2) Tick the confirm gate → Go Live succeeds.
    await gateCheckbox.check().catch(async () => {
      // Fallback: click the label text (checkbox may be visually hidden).
      await page.getByText(/I confirm the asking price, revenue/i).click()
    })
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: /Approve & Go Live/ }).click()
    await page.waitForTimeout(3000)
    const body2 = await page.locator('body').innerText()
    const live = body2.includes('✓ Live on the marketplace')
    console.log('GATE: listing live after confirmation:', live)
    expect(live, 'listing should go live once the broker confirms the figures').toBe(true)
  })
})
