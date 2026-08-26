/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { test, expect } from '@playwright/test'
import { signIn } from './helpers'

// =============================================================================
// Training flows — the rebuilt CBI program: gamification, simulator, roleplay,
// analytics, and the public trust surfaces.
// =============================================================================

test.describe('training rebuild', () => {
  test('public CBI sales page renders pricing + curriculum', async ({ page }) => {
    await page.goto('/cbi')
    await expect(page.getByRole('heading', { name: /certified business intermediary/i }).first()).toBeVisible()
    await expect(page.getByText('$497').first()).toBeVisible()
    await expect(page.getByText('$997').first()).toBeVisible()
    await expect(page.getByRole('link', { name: /create free account/i }).first()).toBeVisible()
  })

  test('public certified directory renders', async ({ page }) => {
    await page.goto('/marketplace/certified')
    await expect(page.getByRole('heading', { name: /certified business intermediaries/i }).first()).toBeVisible()
  })

  test('training dashboard shows gamification + simulator + roleplay', async ({ page }) => {
    await signIn(page)
    await page.goto('/dashboard/training')
    await expect(page.getByText(/certified business intermediary \(cbi\) program/i).first()).toBeVisible({ timeout: 20_000 })
    // Gamification card (XP/streak/tier).
    await expect(page.getByText(/your cbi title/i).first()).toBeVisible()
    // Deal Simulator.
    await expect(page.getByText(/deal simulator/i).first()).toBeVisible()
    // Negotiation Roleplay.
    await expect(page.getByText(/negotiation roleplay/i).first()).toBeVisible()
  })

  test('a lesson page renders the AI Tutor panel', async ({ page }) => {
    await signIn(page)
    // Navigate to a real published lesson (prod IDs) — dashboard first module
    // may be the hidden program module with no lesson links.
    await page.goto('/dashboard/training/c0dec0de-0001-4000-8000-000000000001/c0dec0de-0101-4000-8000-000000000001')
    await expect(page.getByText(/ai tutor/i).first()).toBeVisible({ timeout: 25_000 })
  })
})
