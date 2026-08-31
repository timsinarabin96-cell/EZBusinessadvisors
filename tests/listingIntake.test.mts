import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const core = readFileSync('lib/listingIntakeCore.ts', 'utf8')
const route = readFileSync('app/api/listings/intake/route.ts', 'utf8')
const modal = readFileSync('components/listings/ListingIntakeModal.tsx', 'utf8')
const form = readFileSync('components/listings/IntelligentListingForm.tsx', 'utf8')

// Import the pure helpers (dependency-free core — no path aliases).
const { sanitizeIntakeDraft, normalizeNumber, anonymizePublic, draftCoverage } =
  await import('../lib/listingIntakeCore.ts')

test('intake: normalizes money strings to plain numbers', () => {
  assert.equal(normalizeNumber('$520,000'), '520000')
  assert.equal(normalizeNumber('128,000'), '128000')
  assert.equal(normalizeNumber('€45'), '45')
  assert.equal(normalizeNumber('4.5'), '4.5')
  assert.equal(normalizeNumber('abc'), '')
  assert.equal(normalizeNumber(null), '')
})

test('intake: sanitize keeps only known fields and normalizes values', () => {
  const draft = sanitizeIntakeDraft({
    business_name: 'Acme Home Care',
    asking_price: '$520,000',
    sde: '128,000',
    real_estate_included: 'yes',
    asset_sale: true,
    bogus_field: 'should be dropped',
    public_summary: 'Great agency near 123 Main St, call 555-123-4567 or bob@x.com',
  })
  assert.equal(draft.business_name, 'Acme Home Care')
  assert.equal(draft.asking_price, '520000')
  assert.equal(draft.sde, '128000')
  assert.equal(draft.real_estate_included, true)
  assert.equal(draft.asset_sale, true)
  assert.ok(!('bogus_field' in draft), 'unknown keys must be dropped')
  // Privacy: phone/email/address scrubbed from buyer-facing copy
  assert.ok(!/555-123-4567/.test(draft.public_summary as string))
  assert.ok(!/bob@x.com/.test(draft.public_summary as string))
  assert.ok(!/123 Main St/.test(draft.public_summary as string))
})

test('intake: falsey booleans coerce correctly', () => {
  const draft = sanitizeIntakeDraft({ seller_financing_available: 'no', show_financials: false })
  assert.equal(draft.seller_financing_available, false)
  assert.equal(draft.show_financials, false)
})

test('intake: coverage counts filled fields', () => {
  const c1 = draftCoverage({})
  assert.equal(c1.filled, 0)
  const c2 = draftCoverage({ business_name: 'X', asking_price: '10' })
  assert.equal(c2.filled, 2)
  assert.ok(c2.total > 30)
})

test('intake: API route is auth-gated, zod-validated, server-only', () => {
  assert.match(route, /export const runtime = 'nodejs'/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /notes: z\.string\(\)\.max\(8000\)\.optional\(\)/)
  assert.match(route, /mode: z\.enum/)
  assert.match(route, /complete\(\{/)
  assert.match(route, /isClaudeConfigured/)
  assert.match(route, /sanitizeIntakeDraft/)
  assert.match(route, /jsonMode: true/)
})

test('intake: public mode drafts only anonymized buyer-facing fields', () => {
  assert.match(route, /SYSTEM_PUBLIC/)
  assert.match(route, /public_title, public_summary, public_highlights/)
  assert.match(route, /mode === 'public'/)
  assert.match(route, /NEVER include/)
})

test('intake: modal pastes notes and calls the intake endpoint', () => {
  assert.match(modal, /✨ AI Intake/)
  assert.match(modal, /\/api\/listings\/intake/)
  assert.match(modal, /mode: 'full'/)
  assert.match(modal, /Try an example/)
})

test('intake: studio wires the button, draft apply, and market radar', () => {
  assert.match(form, /ListingIntakeModal/)
  assert.match(form, /✨ AI Intake/)
  assert.match(form, /applyIntakeDraft/)
  assert.match(form, /MarketRadarCard/)
  assert.match(form, /bandForIndustry/)
  assert.match(form, /pricePosition/)
  assert.match(form, /📈 Market check/)
})
