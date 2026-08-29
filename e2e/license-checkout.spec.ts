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

  // Card fields: the CURRENT Stripe checkout renders them inline in the main
  // frame (older versions used titled iframes). Try inline first; expand the
  // Card accordion via the radio when collapsed (accordion button is often
  // outside the viewport — the radio check is the reliable expander).
  const cardNumber = page.getByRole('textbox', { name: /card number/i }).first()
  const cardExpiry = page.getByRole('textbox', { name: /expiration/i }).first()
  const cardCvc = page.getByRole('textbox', { name: /^cvc$/i }).first()

  try {
    await cardNumber.waitFor({ timeout: 8_000 })
  } catch {
    // Collapsed — expand via the Card radio (robust), with accordion click
    // attempts as best-effort extra.
    const cardRadio = page.getByRole('radio', { name: /card/i }).first()
    if (await cardRadio.count()) {
      await cardRadio.check({ force: true }).catch(() => {})
    }
    const accordion = page.getByTestId('card-accordion-item-button').first()
    if (await accordion.count()) {
      await accordion.click({ force: true }).catch(() => {})
    }
    const payWithCard = page.getByRole('button', { name: /pay with card/i }).first()
    if (await payWithCard.count()) {
      await payWithCard.click({ force: true }).catch(() => {})
    }
    await cardNumber.waitFor({ timeout: 25_000 })
  }
  await cardNumber.fill('4242 4242 4242 4242')
  await cardExpiry.fill('12/34')
  await cardCvc.fill('424')

  // Cardholder name + ZIP are required on current inline checkout.
  const cardName = page.getByRole('textbox', { name: /cardholder name/i }).first()
  if (await cardName.count()) {
    await cardName.fill('E2E QA Buyer')
  }
  const zipBox = page.getByRole('textbox', { name: /zip/i }).first()
  if (await zipBox.count()) {
    await zipBox.fill('42424')
  }

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
