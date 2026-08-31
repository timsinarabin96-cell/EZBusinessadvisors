import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// =============================================================================
// Listing Advisor — docs in → questions → valuation → listability → CIM prep.
// Source-level regression tests (repo style).
// =============================================================================

test('advisor engine covers the four deliverable sections', () => {
  const src = readFileSync('lib/listingAdvisor.ts', 'utf8')
  assert.match(src, /buildDeterministicQuestions/)
  assert.match(src, /buildDeterministicValuation/)
  assert.match(src, /buildDeterministicVerdict/)
  assert.match(src, /buildDeterministicCimChecklist/)
  assert.match(src, /runListingAdvisor/)
  assert.match(src, /worthListing/)
  assert.match(src, /cimChecklist/)
})

test('advisor engine is gap-driven (lease, inventory, concentration, reason-for-sale)', () => {
  const src = readFileSync('lib/listingAdvisor.ts', 'utf8')
  assert.match(src, /Lease transferability/)
  assert.match(src, /inventory value at cost/i)
  assert.match(src, /customer concentration/i)
  assert.match(src, /reason for selling/)
  assert.match(src, /fuel gallonage/i)
  assert.match(src, /owner hours/i)
})

test('advisor uses the shared financial metrics + Claude polish with silent fallback', () => {
  const src = readFileSync('lib/listingAdvisor.ts', 'utf8')
  assert.match(src, /computeFinancialMetrics/)
  assert.match(src, /complete\(\{/)
  assert.match(src, /jsonMode: true/)
  assert.match(src, /model: 'deterministic'/)
  assert.match(src, /catch \{[\s\S]*return deterministic/)
})

test('advisor API requires auth + agency membership and returns the report', () => {
  const route = readFileSync('app/api/listing-advisor/route.ts', 'utf8')
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /canManageAgency/)
  assert.match(route, /forbiddenResponse/)
  assert.match(route, /runListingAdvisor/)
  assert.match(route, /listingId is required/)
})

test('advisor dashboard page wires the picker + run + report sections', () => {
  const page = readFileSync('components/listing/ListingAdvisorPanel.tsx', 'utf8')
  assert.match(page, /api\/listing-advisor/)
  assert.match(page, /api\/listings\/options/)
  assert.match(page, /Listability verdict/)
  assert.match(page, /What it&apos;s worth/)
  assert.match(page, /Questions to ask the seller/)
  assert.match(page, /CIM prep checklist/)
  assert.match(page, /Run Advisor/)
})

test('advisor is reachable from the CRM nav', () => {
  const nav = readFileSync('components/layout/navConfig.ts', 'utf8')
  assert.match(nav, /\/dashboard\/listing-advisor/)
  assert.match(nav, /Listing Advisor/)
})
