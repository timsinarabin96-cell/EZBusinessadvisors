/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Dashboard sweep — the boss wants EVERYTHING human-tested. This spec signs in
// once, then walks the entire dashboard like a broker browsing their CRM,
// asserting each page actually renders (no crash boundary, nav present).
// =============================================================================

import { test, expect } from '@playwright/test'
import { signIn } from './helpers'

test.setTimeout(240_000)

const DASHBOARD_ROUTES = [
  '/dashboard',
  '/dashboard/activity',
  '/dashboard/ai',
  '/dashboard/analytics',
  '/dashboard/blog',
  '/dashboard/buyer',
  '/dashboard/calendar',
  '/dashboard/calls',
  '/dashboard/certificates',
  '/dashboard/closing',
  '/dashboard/command-center',
  '/dashboard/commissions',
  '/dashboard/communications',
  '/dashboard/comps',
  '/dashboard/documents',
  '/dashboard/documents/builder',
  '/dashboard/email-templates',
  '/dashboard/expenses',
  '/dashboard/expiry',
  '/dashboard/financial-files',
  '/dashboard/newspaper',
  '/dashboard/notifications',
  '/dashboard/nurture',
  '/dashboard/offer-lab',
  '/dashboard/off-market',
  '/dashboard/onboarding',
  '/dashboard/owner',
  '/dashboard/passwords',
  '/dashboard/performance',
  '/dashboard/pipeline',
  '/dashboard/portal',
  '/dashboard/professionals',
  '/dashboard/profile',
  '/dashboard/readiness',
  '/dashboard/referrals',
  '/dashboard/reminders',
  '/dashboard/review-queue',
  '/dashboard/search',
  '/dashboard/security',
  '/dashboard/seller-leads',
  '/dashboard/settings',
  '/dashboard/social',
  '/dashboard/studio',
  '/dashboard/syndication',
  '/dashboard/tools',
  '/dashboard/training',
  '/dashboard/valuation',
  '/dashboard/valuation-reports',
  '/dashboard/watchlist',
  // Top-level CRM pages
  '/leads',
  '/pipeline',
  '/listings',
  '/documents',
  '/recast',
  '/billing',
  '/bov',
  '/cim',
]

// Error-boundary / crash signatures that mean a page is NOT working.
const CRASH_PATTERNS = [
  /application error/i,
  /something went wrong/i,
  /unhandled runtime error/i,
  /internal server error/i,
  /this page could not be found/i,
  /error: /i,
]

test.describe('dashboard sweep', () => {
  test('every dashboard page renders for a signed-in broker', async ({ page }) => {
    await signIn(page)
    await expect(page).toHaveURL(/dashboard/, { timeout: 20_000 })

    const failures: string[] = []
    for (const route of DASHBOARD_ROUTES) {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {})
      await page.waitForLoadState('domcontentloaded').catch(() => {})
      // Let client components hydrate.
      await page.waitForTimeout(700)

      const bodyText = await page.locator('body').innerText().catch(() => '')
      const crashed = CRASH_PATTERNS.some((re) => re.test(bodyText.slice(0, 4000)))
      // A page is fine if it has some real content (not just the empty shell).
      const hasContent = bodyText.trim().length > 120
      const navPresent = await page.locator('nav, header, aside').first().isVisible().catch(() => false)

      if (crashed || !hasContent || !navPresent) {
        failures.push(`${route} ${crashed ? '[crash]' : !hasContent ? '[empty]' : '[no-nav]'}`)
      }
    }

    expect(failures, `dashboard pages failed:\n${failures.join('\n')}`).toEqual([])
  })
})
