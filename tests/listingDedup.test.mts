import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const core = readFileSync('lib/listingDedupCore.ts', 'utf8')
const lib = readFileSync('lib/listingDedup.ts', 'utf8')
const modal = readFileSync('components/listings/DuplicateListingModal.tsx', 'utf8')
const form = readFileSync('components/listings/IntelligentListingForm.tsx', 'utf8')

// Import the pure helpers (dependency-free core — no path aliases).
const { normalizeBusinessName, nameTokenSimilarity, findListingDuplicates, scoreCandidate } =
  await import('../lib/listingDedupCore.ts')

test('dedup: normalizes business names (legal suffixes, punctuation, case)', () => {
  assert.equal(normalizeBusinessName('Acme Home Care LLC'), 'acme home care')
  assert.equal(normalizeBusinessName('ACME HOME CARE, Inc.'), 'acme home care')
  assert.equal(normalizeBusinessName('  Acme   Home Care  '), 'acme home care')
  assert.equal(normalizeBusinessName('Sunoco Gas Station'), 'sunoco gas station')
  assert.equal(normalizeBusinessName(null), '')
})

test('dedup: token similarity ranks close names high', () => {
  assert.equal(nameTokenSimilarity('acme home care', 'acme home care'), 1)
  assert.ok(nameTokenSimilarity('acme home care', 'acme home care agency') >= 0.66)
  assert.ok(nameTokenSimilarity('acme home care', 'bobs auto repair') < 0.3)
})

test('dedup: exact name + industry + location is a HIGH match', () => {
  const m = scoreCandidate(
    { business_name: 'Acme Home Care', industry: 'Home Care', location_general: 'Harrisburg, PA', asking_price: 500000 },
    { id: 'x', listing_ref: 'EZB-0142', business_name: 'Acme Home Care LLC', industry: 'Home Care', location_general: 'Harrisburg, PA', asking_price: 480000 },
  )
  assert.ok(m, 'expected a match')
  assert.equal(m!.level, 'high')
  assert.ok(m!.reasons.some((r) => r.includes('Same business name')))
  assert.ok(m!.reasons.some((r) => r.includes('Same industry')))
})

test('dedup: partial overlap is medium or low, never high', () => {
  const m = scoreCandidate(
    { business_name: 'Acme Home Care', industry: 'Home Care', location_general: 'Harrisburg, PA' },
    { id: 'y', business_name: 'Acme Landscaping', industry: 'Landscaping', location_general: 'Pittsburgh, PA' },
  )
  assert.ok(m === null || m.level !== 'high')
})

test('dedup: findListingDuplicates returns sorted best-first matches', () => {
  const matches = findListingDuplicates(
    { business_name: 'Acme Home Care', industry: 'Home Care', location_general: 'Harrisburg, PA' },
    [
      { id: 'a', business_name: 'Acme Landscaping', industry: 'Landscaping' },
      { id: 'b', business_name: 'Acme Home Care LLC', industry: 'Home Care', location_general: 'Harrisburg, PA' },
      { id: 'c', business_name: 'Totally Different Bakery', industry: 'Bakery' },
    ],
  )
  assert.ok(matches.length >= 1)
  assert.equal(matches[0].candidate.id, 'b')
  for (let i = 1; i < matches.length; i++) {
    assert.ok(matches[i - 1].score >= matches[i].score)
  }
})

test('dedup: empty input yields no matches', () => {
  assert.equal(findListingDuplicates({ business_name: null }, [{ id: 'a', business_name: 'X' }]).length, 0)
})

test('dedup: wrapper fetches candidates and checks duplicates', () => {
  assert.match(lib, /fetchListingCandidates/)
  assert.match(lib, /checkListingDuplicates/)
  assert.match(lib, /from\('listings'\)/)
  assert.match(lib, /listing_ref, business_name, industry, location_general, asking_price, status/)
})

test('dedup: studio guards creation with a modal decision', () => {
  assert.match(form, /checkListingDuplicates/)
  assert.match(form, /DuplicateListingModal/)
  assert.match(form, /setDupes\(strong\)/)
  assert.match(form, /setDupes\(null\); doCreate\(\)/)
  assert.match(modal, /Existing listing matches/)
  assert.match(modal, /Open existing listing/)
  assert.match(modal, /Continue anyway/)
  assert.match(modal, /Likely duplicate/)
})
