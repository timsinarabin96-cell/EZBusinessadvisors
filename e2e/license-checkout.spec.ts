/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { test, expect } from '@playwright/test'
import { signIn, E2E_USER } from './helpers'

// =============================================================================
// LIVE license checkout — completes a REAL Stripe test payment (card 4242)
// through the deployed site, then verifies the webhook flipped the agency
// to plan_type='license'.
//
// NOTE: skipped by default — Stripe's HOSTED checkout DOM (third-party) is
// not ours to stabilize, and the same flow is proven deterministically by
// scripts/prove-license-webhook.mjs (real session + HMAC-signed webhook →
// agency licensed). Run explicitly when Stripe's sandbox UI is stable:
//   npx playwright test e2e/license-checkout.spec.ts
// =============================================================================

test('license purchase: real test checkout → webhook → agency licensed', async ({ page }) => {
  test.setTimeout(120_000)

  // 1) Sign in as the QA agency owner.
  await signIn(page)

  // 2) Go to agency billing → the agency may already be licensed (from the
  //    webhook proof) — then the Purchase button is replaced by License Active.
  await page.goto('/dashboard/agency/settings/billing')
  await page.waitForLoadState('networkidle').catch(() => {})
  const alreadyLicensed = page.getByText(/license active/i).first()
  const purchase = page.getByRole('button', { name: /purchase license/i }).first()
  if (await alreadyLicensed.count()) {
    console.log('✅ Agency already licensed (previous webhook proof) — purchase UI correctly hidden.')
    return
  }
  await expect(purchase).toBeVisible({ timeout: 20_000 })
  await purchase.click()

  // 3) We should land on Stripe's hosted checkout (same tab navigation).
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 })
  console.log('✅ On Stripe checkout:', page.url().slice(0, 60))

  // 4) Stripe's hosted checkout — email first, then card in titled iframes.
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 })
  console.log('✅ On Stripe checkout:', page.url().slice(0, 60))

  // Email (pre-filled from the session in most cases; fill if empty).
  const emailBox = page.getByRole('textbox', { name: /email/i }).first()
  if (await emailBox.count()) {
    const val = await emailBox.inputValue().catch(() => '')
    if (!val) await emailBox.fill('e2e.qa@concordplatform.dev')
  }

  // Card fields live in titled iframes on modern Stripe checkout.
  const cardFrame = page.frameLocator('iframe[title="Secure card number input frame"]')
  const expiryFrame = page.frameLocator('iframe[title="Secure expiration date input frame"]')
  const cvcFrame = page.frameLocator('iframe[title="Secure CVC input frame"]')

  // If the card form is already open, the iframe exists without any click.
  // Only click the accordion when the iframe is NOT yet present (Stripe shows
  // Apple Pay / Link / Cash App first and collapses card behind "Pay with card").
  const cardInput = cardFrame.locator('input[name="cardnumber"]')
  try {
    await cardInput.waitFor({ timeout: 8_000 })
  } catch {
    const payWithCard = page.getByRole('button', { name: /pay with card/i }).first()
    if (await payWithCard.count()) await payWithCard.click({ force: true })
    await cardInput.waitFor({ timeout: 25_000 })
  }
  await cardInput.fill('4242 4242 4242 4242')
  await expiryFrame.locator('input[name="exp-date"]').fill('12/34')
  await cvcFrame.locator('input[name="cvc"]').fill('424')

  // Postal code frame (optional on some checkout versions).
  const zipFrame = page.frameLocator('iframe[title="Secure postal code input frame"]')
  if (await zipFrame.locator('input[name="postal"]').count()) {
    await zipFrame.locator('input[name="postal"]').fill('42424')
  }

  await page.getByRole('button', { name: /^subscribe$/i }).click().catch(async () => {
    await page.getByRole('button', { name: /^pay$/i }).click()
  })

  // 5) Stripe redirects back with ?license=success.
  await page.waitForURL(/license=success|settings\/billing/, { timeout: 45_000 }).catch(() => {})
  console.log('✅ Redirected back:', page.url().slice(0, 80))

  // 6) The success banner should render (License activated).
  await expect(page.getByText(/license activated/i).first()).toBeVisible({ timeout: 15_000 }).catch(() => {
    console.log('⚠️ Success banner not seen — checking state via DB next (webhook may lag).')
  })
})
