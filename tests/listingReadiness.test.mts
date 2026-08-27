import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const core = readFileSync('lib/listingReadinessCore.ts', 'utf8')
const lib = readFileSync('lib/listingReadiness.ts', 'utf8')
const panel = readFileSync('components/listings/ListingReadinessPanel.tsx', 'utf8')
const pipeline = readFileSync('lib/listingPipeline.ts', 'utf8')
const wfPage = readFileSync('components/studio/AIDealStudio.tsx', 'utf8')
const step8 = readFileSync('components/listings/Step8ListBusiness.tsx', 'utf8')

// Import the pure scorer (dependency-free core — no path aliases).
const { computeReadiness } = await import('../lib/listingReadinessCore.ts')

const baseSnapshot: Parameters<typeof computeReadiness>[0] = {
  listing: {
    business_name: 'Acme Care', headline: 'Home care agency', description: 'desc',
    industry: 'Home Care', location_general: 'PA', asking_price: 500000,
    sde: 120000, ebitda: 100000, annual_revenue: 400000,
    status: 'draft', has_cover_image: true,
  },
  workflow: { current_step: 1, completed_steps: [] },
  documents: { has_listing_agreement: false },
  financials: { exists: false, has_sde: false, has_revenue: false },
  recast: { exists: false },
  bov: { exists: false, finalized: false },
  cim: { exists: false, finalized: false },
  bli: { exists: false },
  sba: { exists: false },
}

test('readiness: empty listing scores low with blockers and cannot publish', () => {
  const r = computeReadiness(baseSnapshot)
  assert.ok(r.score <= 15, `expected low score, got ${r.score}`)
  assert.equal(r.canPublish, false)
  assert.ok(r.blockers.length >= 6, `expected multiple blockers, got ${r.blockers.length}`)
  assert.ok(r.nextAction.toLowerCase().includes('legal docs'))
  assert.equal(r.isListed, false)
})

test('readiness: complete required steps unlock publishing', () => {
  const r = computeReadiness({
    ...baseSnapshot,
    workflow: { current_step: 8, completed_steps: [1, 2, 3, 4, 5, 6] },
    documents: { has_listing_agreement: true },
    financials: { exists: true, has_sde: true, has_revenue: true },
    recast: { exists: true },
    bov: { exists: true, finalized: true },
    cim: { exists: true, finalized: true },
    bli: { exists: true },
  })
  assert.equal(r.canPublish, true)
  assert.equal(r.blockers.length, 0)
  assert.equal(r.score, 100)
  assert.ok(r.nextAction.toLowerCase().includes('publish'))
})

test('readiness: partial steps halve their weight and block publish', () => {
  const r = computeReadiness({
    ...baseSnapshot,
    documents: { has_listing_agreement: true },
    financials: { exists: true, has_sde: false, has_revenue: true }, // partial
  })
  assert.equal(r.canPublish, false)
  assert.ok(r.score >= 5 && r.score < 100)
  const fin = r.steps.find((s) => s.step === 2)
  assert.equal(fin!.status, 'partial')
})

test('readiness: optional steps add bonus but never block publish', () => {
  const complete = {
    ...baseSnapshot,
    workflow: { current_step: 9, completed_steps: [1, 2, 3, 4, 5, 6, 9] },
    documents: { has_listing_agreement: true },
    financials: { exists: true, has_sde: true, has_revenue: true },
    recast: { exists: true },
    bov: { exists: true, finalized: true },
    cim: { exists: true, finalized: true },
    bli: { exists: true },
    sba: { exists: true },
  }
  const r = computeReadiness(complete)
  assert.equal(r.canPublish, true)
  assert.ok(r.score >= 100) // optional bonuses push above 100 cap
  assert.equal(r.score, 100) // capped
  const sba = r.steps.find((s) => s.step === 7)
  assert.equal(sba!.status, 'optional_done')
})

test('readiness: live listing is flagged as listed', () => {
  const r = computeReadiness({ ...baseSnapshot, listing: { ...baseSnapshot.listing, status: 'active' } })
  assert.equal(r.isListed, true)
})

test('readiness: panel renders score, blockers and step checklist', () => {
  assert.match(panel, /Listing Readiness/)
  assert.match(panel, /Next:/)
  assert.match(panel, /Not publish-ready/)
  assert.match(panel, /Ready to publish/)
  assert.match(panel, /⟳ Refresh/)
})

test('readiness: AI Deal Studio mounts the readiness panel + auto-advance (Verify phase)', () => {
  assert.match(wfPage, /ListingReadinessPanel/)
  assert.match(wfPage, /ListingReadinessPanel listingId=\{listingId\}/)
  assert.match(wfPage, /autoAdvance\(listingId, activeStep\)/)
  assert.match(wfPage, /toast\(notes\.join\(' \u00b7 '\)/)
})

test('readiness: step 8 gates publish on readiness', () => {
  assert.match(step8, /fetchListingReadiness/)
  assert.match(step8, /canPublish/)
  assert.match(step8, /Not ready to publish/)
  assert.match(step8, /Readiness/)
})

test('readiness: pipeline auto-generates docs after financials/recast steps', () => {
  assert.match(pipeline, /autoAdvance/)
  assert.match(pipeline, /api\/financial\/generate/)
  assert.match(pipeline, /step === 2/)
  assert.match(pipeline, /step === 3/)
  assert.match(pipeline, /step === 5/)
  assert.match(pipeline, /getStoredAccessToken/)
})
