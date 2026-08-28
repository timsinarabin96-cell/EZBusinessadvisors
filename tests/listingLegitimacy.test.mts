/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessLegitimacy, MIN_BUSINESS_AGE_YEARS } from '../lib/listingLegitimacy.ts'

const NOW = new Date('2026-08-28T00:00:00Z')

const legit = {
  establishedYear: 2015,
  revenueYear1: 400_000,
  revenueYear2: 450_000,
  revenueYear3: 520_000,
  scamScore: 12,
  financialsStatus: 'submitted',
}

test('legitimacy: clean listing auto-approves', () => {
  const r = assessLegitimacy(legit, NOW)
  assert.equal(r.verdict, 'auto_approved')
  assert.ok(r.score >= 80, `score ${r.score} should be high`)
})

test('legitimacy: missing financials → pending (cannot go live)', () => {
  const r = assessLegitimacy({ ...legit, financialsStatus: 'missing', revenueYear1: null, revenueYear2: null, revenueYear3: null }, NOW)
  assert.equal(r.verdict, 'pending')
  assert.ok(r.reasons.some((x) => x.includes('3 years of financials')))
})

test('legitimacy: partial financials (some years null) → pending', () => {
  const r = assessLegitimacy({ ...legit, revenueYear2: null }, NOW)
  assert.equal(r.verdict, 'pending')
})

test(`legitimacy: business younger than ${MIN_BUSINESS_AGE_YEARS} years → rejected (premature)`, () => {
  const r = assessLegitimacy({ ...legit, establishedYear: NOW.getFullYear() - 1 }, NOW)
  assert.equal(r.verdict, 'rejected')
  assert.ok(r.reasons.some((x) => x.includes(`at least ${MIN_BUSINESS_AGE_YEARS} years`)))
})

test('legitimacy: exactly 3 years old is accepted (boundary)', () => {
  const r = assessLegitimacy({ ...legit, establishedYear: NOW.getFullYear() - 3 }, NOW)
  assert.equal(r.verdict, 'auto_approved')
})

test('legitimacy: high scam risk (>=55) → rejected', () => {
  const r = assessLegitimacy({ ...legit, scamScore: 72 }, NOW)
  assert.equal(r.verdict, 'rejected')
  assert.ok(r.reasons.some((x) => x.includes('scam-risk')))
})

test('legitimacy: medium scam risk (30-54) → broker review', () => {
  const r = assessLegitimacy({ ...legit, scamScore: 44 }, NOW)
  assert.equal(r.verdict, 'broker_review')
})

test('legitimacy: sustained 3x+ revenue jumps → not auto-approved', () => {
  const r = assessLegitimacy({ ...legit, revenueYear1: 100_000, revenueYear2: 400_000, revenueYear3: 1_600_000 }, NOW)
  assert.notEqual(r.verdict, 'auto_approved')
})

test('legitimacy: zero/negative revenue → rejected', () => {
  const r = assessLegitimacy({ ...legit, revenueYear3: 0 }, NOW)
  assert.equal(r.verdict, 'rejected')
})

test('legitimacy: rejected financials → rejected', () => {
  const r = assessLegitimacy({ ...legit, financialsStatus: 'rejected' }, NOW)
  assert.equal(r.verdict, 'rejected')
})
