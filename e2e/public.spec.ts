/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { test, expect } from '@playwright/test'

// =============================================================================
// Public website flows — no login required. These guard the money pages:
// homepage, license sales page, marketplace, listing detail, contact, auth.
// =============================================================================

test.describe('public website', () => {
  test('homepage renders the core selling blocks', async ({ page }) => {
    await page.goto('/')
    // Homepage H1 is "Buy or Sell a Business With Confidence"; section heading
    // "Recently Listed Businesses" is the stable anchor.
    await expect(page.getByRole('heading', { name: /recently listed businesses/i }).first()).toBeVisible()
    // License CTA — the money funnel.
    await expect(page.getByRole('link', { name: /buy the license/i }).first()).toBeVisible()
    await expect(page.getByText(/own the crm platform/i).first()).toBeVisible()
  })

  test('license page shows price card and purchase funnel', async ({ page }) => {
    await page.goto('/license')
    await expect(page.getByText(/one-time license/i).first()).toBeVisible()
    await expect(page.getByText('$4,999').first()).toBeVisible()
    await expect(page.getByRole('link', { name: /buy the license/i }).first()).toBeVisible()
    // Software-license disclaimer (boss FYI: we don't sell real-estate licenses).
    await expect(page.getByText(/software license/i).first()).toBeVisible()
  })

  test('marketplace listings page renders grid + search', async ({ page }) => {
    await page.goto('/marketplace/listings')
    await expect(page.getByRole('heading', { name: /businesses for sale/i }).first()).toBeVisible()
    // Either a grid of listings or an honest empty state.
    const cards = page.locator('a[href*="/marketplace/listings/"]')
    const empty = page.getByText(/no (businesses|listings)/i).first()
    await expect(cards.first().or(empty)).toBeVisible()
  })

  test('contact form validates empty submit', async ({ page }) => {
    await page.goto('/contact')
    await page.getByRole('button', { name: /send message/i }).first().click()
    // Native required fields block submit — form must not navigate away.
    await expect(page).toHaveURL(/\/contact$/)
  })

  test('contact form sends and shows success state', async ({ page }) => {
    await page.goto('/contact')
    await page.locator('input[placeholder*="Full Name"]').fill('E2E Test')
    await page.locator('input[placeholder*="Email"]').fill('e2e.qa@concordplatform.dev')
    await page.locator('textarea[placeholder*="How can we help"]').fill('Automated E2E contact test — please ignore.')
    await page.getByRole('button', { name: /send message/i }).first().click()
    await expect(page.getByText(/message sent/i).first()).toBeVisible({ timeout: 20_000 })
  })

  test('unknown route shows branded 404', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-xyz')
    await expect(page.getByText('404').first()).toBeVisible()
    await expect(page.getByRole('link', { name: /back to home/i })).toBeVisible()
  })

  test('auth and signup pages render', async ({ page }) => {
    await page.goto('/auth')
    await expect(page.getByRole('heading', { name: /welcome back/i }).first()).toBeVisible()
    await page.goto('/auth/signup')
    await expect(page.getByText(/create your account/i).first()).toBeVisible()
  })

  test('sitemap xml resolves', async ({ request }) => {
    const res = await request.get('/sitemap.xml')
    expect(res.ok()).toBeTruthy()
    const body = await res.text()
    expect(body).toContain('<loc>')
  })
})
