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
  '/dashboard/buyer',
  '/dashboard/calendar',
  '/dashboard/certificates',
  '/dashboard/closing',
  '/dashboard/deal-terms',
  '/dashboard/deal-docs',
  '/dashboard/command-center',
  '/dashboard/communications',
  '/dashboard/documents',
  '/dashboard/documents/builder',
  '/dashboard/expiry',
  '/dashboard/finance',
  '/dashboard/financial-files',
  '/dashboard/off-market',
  '/dashboard/owner',
  '/dashboard/passwords',
  '/dashboard/portal',
  '/dashboard/reports',
  '/dashboard/profile',
  '/dashboard/review-queue',
  '/dashboard/search',
  '/dashboard/security',
  '/dashboard/settings',
  '/dashboard/studio',
  '/dashboard/tools',
  '/dashboard/training',
  '/dashboard/team',
  '/dashboard/valuation',
  // Top-level CRM pages
  '/leads',
  '/pipeline',
  '/listings',
  '/documents',
  '/billing',
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
