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
    // Module 1, lesson 1 from the seed data.
    await page.goto('/dashboard/training/11111111-1111-1111-1111-111111111101/22222222-2222-2222-2222-222222222201')
    await expect(page.getByText(/ai tutor/i).first()).toBeVisible({ timeout: 20_000 })
  })
})
