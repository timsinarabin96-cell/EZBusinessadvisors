/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 */

// =============================================================================
// INLINE EDIT + SAVE-DRAFT/RESUME — the two brand-new studio flows that had no
// automation:
//   1. SAVE DRAFT: broker pastes partial notes → 💾 Save Draft → deep link
//      (?listing=<id>) survives refresh → reload restores the notes into the
//      intake editor (no AI run).
//   2. INLINE EDIT: after a build, broker clicks ✏️ Edit figures on the review
//      screen, changes a figure, saves → the record updates and persists.
// Run: E2E_EMAIL=... E2E_PASSWORD=*** npx playwright test e2e/inline-edit-draft-resume.spec.ts
// =============================================================================

import { test, expect } from '@playwright/test'
import { signIn, oneShotBuildDeal } from './helpers'

test.setTimeout(420_000)

const ADMIN_EMAIL = process.env.E2E_EMAIL || 'e2e.qa@concordplatform.dev'
const ADMIN_PASSWORD = process.env.E2E_PASSWORD || 'E2e!Test#2026#Concord'

test.describe('STUDIO FLOWS — save-draft/resume + inline edit', () => {
  test('save partial notes as draft → refresh → notes restored (no AI run)', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await expect(page).toHaveURL(/dashboard/, { timeout: 20000 })

    const bizName = `Draft Resume Biz ${Date.now().toString().slice(-6)}`
    const partialNotes = `${bizName} — cleaning company in York, PA. Asking $250,000.` // deliberately thin — no build yet

    await page.goto('/dashboard/listings/new')
    await page.getByPlaceholder(/Paste anything/).waitFor({ timeout: 30000 })
    await page.getByPlaceholder(/Paste anything/).fill(partialNotes)

    // Save Draft — must NOT run the AI pipeline, just persist + deep link.
    await page.getByRole('button', { name: /Save Draft/ }).click()
    await page.getByText(/Draft saved/i).waitFor({ timeout: 15000 })
    const url = page.url()
    expect(url).toMatch(/listing=/)
    const listingId = new URL(url).searchParams.get('listing')
    expect(listingId).toBeTruthy()
    console.log('DRAFT: saved, listing=', listingId)

    // No build should have started (still on the intake screen).
    expect(await page.getByRole('button', { name: /Build Entire Deal/ }).isVisible().catch(() => false)).toBe(true)
    console.log('DRAFT: still on intake (no AI run) ✅')

    // Refresh → the deep link should restore the notes into the editor.
    await page.reload()
    await page.getByPlaceholder(/Paste anything/).waitFor({ timeout: 30000 })
    const restored = await page.getByPlaceholder(/Paste anything/).inputValue()
    expect(restored).toContain(bizName)
    expect(restored).toContain('cleaning company')
    console.log('DRAFT: notes restored after refresh ✅')
  })

  test('inline edit figures on the review screen → saved + persisted', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await expect(page).toHaveURL(/dashboard/, { timeout: 20000 })

    const bizName = `Inline Edit Biz ${Date.now().toString().slice(-6)}`
    const notes =
      `${bizName} — established auto repair shop in Mechanicsburg, PA. ` +
      'Asking $425,000. Annual revenue $510,000, SDE $98,000, 4 full-time employees. ' +
      'Loyal repeat customers, trained staff. Owner retiring after 15 years.'
    const listingId = await oneShotBuildDeal(page, notes)
    expect(listingId, 'build should land a ?listing= review URL').toBeTruthy()
    console.log('INLINE: build complete, listing=', listingId)

    // Review screen → open the inline figure editor.
    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: /Edit figures/ }).waitFor({ timeout: 15000 })
    await page.getByRole('button', { name: /Edit figures/ }).click()

    // Change the asking price (first decimal input) → save.
    const newPrice = '512000'
    const inputs = page.locator('input[inputmode="decimal"]')
    await inputs.first().waitFor({ timeout: 8000 })
    await inputs.first().fill(newPrice)
    await page.getByRole('button', { name: /Save figures/ }).click()

    // The record should re-render with the new formatted figure.
    await page.getByText(/Figures updated/i).waitFor({ timeout: 15000 }).catch(() => {})
    await page.getByText(/Edit figures/).waitFor({ timeout: 15000 }) // back to read-only
    const body = await page.locator('body').innerText()
    expect(body).toMatch(/512,000/)
    console.log('INLINE: new figure shown on record ✅')

    // Persistence: reload the deep link → still the new price.
    await page.goto(`/dashboard/studio?listing=${listingId}`)
    await page.getByText(/The Deal|THE DEAL/i).waitFor({ timeout: 30000 })
    await page.getByRole('button', { name: /Edit figures/ }).waitFor({ timeout: 15000 })
    const afterReload = await page.locator('body').innerText()
    expect(afterReload).toMatch(/512,000/)
    console.log('INLINE: figure persisted across reload ✅')
  })
})
