/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// AI PHOTO STUDIO E2E — exercises the AI Photo Studio end to end in the
// One-Shot Deal Builder review screen:
//   1. sign in
//   2. One-Shot build a deal from notes (streaming pipeline)
//   3. review screen renders with the AI Photo Studio card
//   4. generate 4 AI photo options (free fallback, can take 10-60s)
//   5. add the first generated option to the gallery
// Run: BASE_URL=http://localhost:3000 npx playwright test e2e/ai-photo-studio.spec.ts
// =============================================================================

import { test, expect } from '@playwright/test'
import { signIn, oneShotBuildDeal } from './helpers'

test.setTimeout(300_000)

const BIZ = `AI Studio Biz ${Date.now().toString().slice(-6)}`

test('agent: One-Shot build → AI Photo Studio generates options and adds one to the gallery', async ({ page }) => {
  await signIn(page)
  await expect(page).toHaveURL(/dashboard/, { timeout: 20_000 })

  // One-Shot build (AI photos generate inside the pipeline too, but the studio
  // card lets the broker regenerate + pick individually).
  const listingId = await oneShotBuildDeal(page,
    `${BIZ} — coffee roastery with wholesale accounts and a downtown cafe in Lancaster, PA. ` +
    'Asking $350,000. Annual revenue $420,000, SDE $82,000, 4 employees. Recurring wholesale contracts.')
  expect(listingId).toBeTruthy()
  console.log('AI STUDIO: one-shot build complete, id=', listingId)

  // The deal review renders with the AI Photo Studio card.
  const studio = page.getByText('AI Photo Studio')
  await studio.waitFor({ timeout: 30_000 })
  console.log('AI STUDIO: card rendered in the deal review')

  // Generate 4 options via the studio card.
  await page.getByRole('button', { name: /Generate 4 photo options/ }).click()
  console.log('AI STUDIO: generation started (free AI can take 10-60s)…')

  // Wait for the option grid to populate (at least one image).
  await page.waitForSelector('img[alt^="AI option"]', { timeout: 150_000 })
  const options = page.locator('img[alt^="AI option"]')
  const count = await options.count()
  console.log(`AI STUDIO: ${count} option(s) generated`)
  expect(count).toBeGreaterThan(0)

  // Add the first option to the gallery.
  await page.getByRole('button', { name: /Save to gallery/ }).first().click()
  await expect(page.getByText('✓ Saved to gallery').first()).toBeVisible({ timeout: 10_000 })
  console.log('AI STUDIO: option added to gallery')
})
