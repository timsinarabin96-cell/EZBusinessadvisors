import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// =============================================================================
// Pricing consistency — ONE source of truth (lib/pricing.ts).
// The boss's rule: CRM monthly = $499.00 EVERYWHERE. If a surface hardcodes a
// different number, this test fails. Also locks in the upsell engine + admin
// AI verify/unlock flow.
// =============================================================================

const pricing = readFileSync('lib/pricing.ts', 'utf8')
const billing = readFileSync('lib/billing.ts', 'utf8')
const convertTrial = readFileSync('app/api/billing/convert-trial/route.ts', 'utf8')
const checkout = readFileSync('app/api/stripe/checkout/route.ts', 'utf8')
const webhook = readFileSync('app/api/stripe/webhook/route.ts', 'utf8')
const licensePage = readFileSync('app/(public)/license/page.tsx', 'utf8')
const pricingPage = readFileSync('app/(public)/pricing/page.tsx', 'utf8')
const verifyUnlock = readFileSync('app/api/admin/verify-unlock/route.ts', 'utf8')
const upsellPanel = readFileSync('components/public/ListingUpsellPanel.tsx', 'utf8')
const adminListings = readFileSync('app/admin/listings/page.tsx', 'utf8')

test('pricing: CRM monthly is 499 in the single source of truth', () => {
  assert.match(pricing, /CRM_MONTHLY = 499/)
  assert.match(pricing, /CRM_ANNUAL = 4790/)
  assert.match(pricing, /LICENSE_SETUP_FEE = 4999/)
  assert.match(pricing, /LICENSE_MONTHLY = 499/)
})

test('pricing: no surface hardcodes the old CRM prices (49/99/470/950/500)', () => {
  // Billing re-exports from pricing (no inline numbers).
  assert.doesNotMatch(billing, /monthly: 49/)
  assert.doesNotMatch(billing, /monthly: 99/)
  assert.doesNotMatch(billing, /setupFee: 4999[\s\S]*monthly: 500/)
  // Convert-trial derives from CRM_PLANS.
  assert.doesNotMatch(convertTrial, /monthly: 49/)
  assert.doesNotMatch(convertTrial, /monthly: 99/)
  assert.match(convertTrial, /CRM_PLANS/)
  // License page no longer hardcodes "$500/mo" or "$4,999" in prose.
  assert.doesNotMatch(licensePage, /\$500\/mo/)
  assert.doesNotMatch(licensePage, /'One-time \$4,999 setup \+ \$500\/mo/)
  assert.match(licensePage, /CRM_LICENSE\.monthly/)
})

test('pricing: stripe checkout + webhook use the cents helpers (no magic numbers)', () => {
  assert.match(checkout, /LICENSE_SETUP_CENTS/)
  assert.match(checkout, /LICENSE_MONTHLY_CENTS/)
  assert.match(checkout, /VERIFIED_REVENUE_PRICE_CENTS/)
  assert.match(checkout, /FINANCIAL_INTELLIGENCE_CENTS/)
  assert.doesNotMatch(checkout, /amountCents: 499900/)
  assert.doesNotMatch(checkout, /amountCents: 50000/)
  // Webhook: the $5,499 typo is gone.
  assert.match(webhook, /LICENSE_SETUP_FEE/)
  assert.doesNotMatch(webhook, /: 5499/)
  assert.doesNotMatch(webhook, /9900 : tier === 'enterprise'/)
})

test('pricing: owner listing is free but the upsell engine exists', () => {
  assert.match(pricing, /OWNER_LISTING_PLANS/)
  assert.match(pricing, /id: 'free', name: 'Free Listing', price: 0/)
  assert.match(pricing, /LISTING_UPSELL_OPTIONS/)
  assert.match(pricing, /featured_30/)
  assert.match(pricing, /verified_revenue/)
  assert.match(pricing, /financial_intelligence/)
  assert.match(upsellPanel, /LISTING_UPSELL_OPTIONS/)
  assert.match(upsellPanel, /\/api\/stripe\/checkout/)
})

test('pricing: admin AI verify & unlock exists end-to-end', () => {
  assert.match(verifyUnlock, /action: z\.enum\(\['verify', 'unlock'\]\)/)
  assert.match(verifyUnlock, /runBankBooksVerification/)
  assert.match(verifyUnlock, /revenue_verified: true/)
  assert.match(verifyUnlock, /is_featured: true/)
  assert.match(verifyUnlock, /financial_intelligence_enabled: true/)
  assert.match(adminListings, /aiVerify/)
  assert.match(adminListings, /aiUnlock/)
  assert.match(adminListings, /AI Verify/)
})

test('pricing: buyer pass stays a SEPARATE product (49/99 buyers, not CRM)', () => {
  // Buyer pass lives in lib/buyerPass.ts — untouched by the CRM consolidation.
  const buyerPass = readFileSync('lib/buyerPass.ts', 'utf8')
  assert.match(buyerPass, /monthly: 49/)
  assert.match(buyerPass, /monthly: 99/)
  // But the pricing page must keep it visually distinct from the CRM tiers.
  assert.match(pricingPage, /BUYER_PASS_PLANS/)
})
