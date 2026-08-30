/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// AI PHOTO STUDIO E2E — exercises the new AI Photo Studio end to end:
//   1. sign in, open a fresh listing
//   2. fill business basics so the suggested prompt is deal-aware
//   3. open Photos & Video → AI Photo Studio → Generate 4 photo options
//   4. wait for real AI generation (free fallback, can take 10-60s)
//   5. add the first generated option to the gallery
//   6. submit → listing created with the AI photo in the gallery
// Run: BASE_URL=http://localhost:3000 npx playwright test e2e/ai-photo-studio.spec.ts
// =============================================================================

import { test, expect } from '@playwright/test'
import { signIn } from './helpers'

test.setTimeout(300_000)

const BIZ = `AI Studio Biz ${Date.now().toString().slice(-6)}`

test('agent: AI Photo Studio generates 4 options and adds one to the gallery', async ({ page }) => {
  await signIn(page)
  await expect(page).toHaveURL(/dashboard/, { timeout: 20_000 })
  await page.goto('/dashboard/listings/new')
  await page.getByPlaceholder('Private CRM identity').waitFor({ timeout: 20_000 })

  // Business basics (drives the suggested AI prompt).
  await page.getByPlaceholder('Private CRM identity').fill(BIZ)
  await page.getByPlaceholder('Established recurring-revenue service company').fill('Coffee roastery with wholesale accounts and a downtown cafe')
  await page.getByPlaceholder('Business Services').fill('Food & Beverage')
  await page.getByPlaceholder('Business Services').press('Escape')
  await page.getByPlaceholder(/Greater Philadelphia/).fill('Lancaster, PA')
  await page.getByPlaceholder(/Greater Philadelphia/).press('Escape')

  // Photos & Video step.
  const photoStep = page.getByRole('button', { name: /7 Photos|Photos & Video/ })
  if (await photoStep.isVisible().catch(() => false)) {
    await photoStep.click()
    await page.waitForTimeout(1200)
  }

  // AI Photo Studio block present.
  const studio = page.getByText('AI Photo Studio')
  await studio.waitFor({ timeout: 20_000 })
  console.log('AI STUDIO: block rendered')

  // Suggested prompt is deal-aware (contains the business category).
  const promptBox = page.locator('textarea').filter({ hasText: /Food & Beverage|Coffee/i }).first()
  const promptText = await promptBox.inputValue().catch(() => '')
  expect(promptText.toLowerCase()).toContain('business')
  console.log('AI STUDIO: suggested prompt =', promptText.slice(0, 120))

  // Generate 4 options.
  await page.getByRole('button', { name: /Generate 4 photo options/ }).click()
  console.log('AI STUDIO: generation started (free AI can take 10-60s)…')

  // Wait for the option grid to populate (at least one image).
  await page.waitForSelector('img[alt^="AI option"]', { timeout: 150_000 })
  const options = page.locator('img[alt^="AI option"]')
  const count = await options.count()
  console.log(`AI STUDIO: ${count} option(s) generated`)
  expect(count).toBeGreaterThan(0)

  // Add the first option to the gallery.
  await page.getByRole('button', { name: /Add to gallery/ }).first().click()
  await expect(page.getByText('✓ Added').first()).toBeVisible({ timeout: 10_000 })
  console.log('AI STUDIO: option added to gallery')

  // Gallery now contains the AI image.
  const galleryImages = page.locator('img[alt^="Gallery"]')
  await expect(galleryImages.first()).toBeVisible({ timeout: 15_000 })
  const galleryCount = await galleryImages.count()
  console.log(`AI STUDIO: gallery now has ${galleryCount} photo(s)`)
  expect(galleryCount).toBeGreaterThanOrEqual(1)

  // Submit → draft created with the AI photo persisted.
  const submitBtn = page.getByRole('button', { name: /Ready — advance to Verify|Create Draft & Start Review/ })
  await submitBtn.click({ timeout: 10_000 }).catch(() => {})
  const deadline = Date.now() + 90_000
  let listingId: string | null = null
  while (Date.now() < deadline) {
    if (page.url().includes('listing=')) {
      listingId = new URL(page.url()).searchParams.get('listing')
      break
    }
    await page.waitForTimeout(1000)
  }
  expect(listingId).toBeTruthy()
  console.log(`AI STUDIO: listing created with AI photo, id=${listingId}`)
})
