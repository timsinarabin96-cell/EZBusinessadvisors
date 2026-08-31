import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// =============================================================================
// LICENSE SUBSCRIPTIONS — Phase 3 regression guard (recurring CRM billing).
// Locks: 3 seats included, +$25/seat/mo (annual $250), monthly+annual cycles,
// prorated seat changes, cancel-at-period-end, Stripe webhook sync, agency
// unlock on payment. Asserts both directions: pure math behavior AND that the
// checkout/management/webhook surfaces are actually wired to it.
// =============================================================================

const core = readFileSync('lib/licenseSubscriptionsCore.ts', 'utf8')
const lib = readFileSync('lib/licenseSubscriptions.ts', 'utf8')
const schema = readFileSync('sql/license_subscriptions_schema.sql', 'utf8')
const checkoutRoute = readFileSync('app/api/billing/license-subscription/checkout/route.ts', 'utf8')
const manageRoute = readFileSync('app/api/billing/license-subscription/route.ts', 'utf8')
const webhook = readFileSync('app/api/stripe/webhook/route.ts', 'utf8')
const panel = readFileSync('components/agency/LicenseSubscriptionPanel.tsx', 'utf8')

const {
  seatAddonQty, totalSeatsFromAddon, licenseBaseCents, licenseSeatAddonDollars,
  licenseTotalCents, licenseStatusFromStripe, licenseAccessGranted,
  licenseBaseLookupKey, licenseSeatLookupKey,
} = await import('../lib/licenseSubscriptionsCore.ts')

// ---------------------------------------------------------------------------
// Pure math: seats + totals
// ---------------------------------------------------------------------------
test('licenses: 3 seats included, add-on qty only beyond that', () => {
  assert.equal(seatAddonQty(1), 0)
  assert.equal(seatAddonQty(3), 0)
  assert.equal(seatAddonQty(4), 1)
  assert.equal(seatAddonQty(8), 5)
  assert.equal(totalSeatsFromAddon(0), 3)
  assert.equal(totalSeatsFromAddon(2), 5)
})

test('licenses: seat add-on dollars use $25 monthly / $250 annual', () => {
  assert.equal(licenseSeatAddonDollars(3, 'monthly'), 0)
  assert.equal(licenseSeatAddonDollars(4, 'monthly'), 25)
  assert.equal(licenseSeatAddonDollars(8, 'monthly'), 125)
  assert.equal(licenseSeatAddonDollars(4, 'annual'), 250)
  assert.equal(licenseSeatAddonDollars(8, 'annual'), 1250)
})

test('licenses: totals = base + seat add-ons, correct cents', () => {
  // Professional monthly $499 + 1 add-on seat $25 = $524.00
  assert.equal(licenseTotalCents('professional', 'monthly', 4), 52400)
  // Professional annual $4,790 + 2 add-on seats $500 = $5,290.00
  assert.equal(licenseTotalCents('professional', 'annual', 5), 529000)
  // Enterprise monthly $899, 3 seats (no add-on)
  assert.equal(licenseTotalCents('enterprise', 'monthly', 3), 89900)
  // Enterprise annual $8,630 + 1 seat $250 = $8,880.00
  assert.equal(licenseTotalCents('enterprise', 'annual', 4), 888000)
  // Base cents sanity
  assert.equal(licenseBaseCents('professional', 'monthly'), 49900)
  assert.equal(licenseBaseCents('professional', 'annual'), 479000)
  assert.equal(licenseBaseCents('enterprise', 'monthly'), 89900)
  assert.equal(licenseBaseCents('enterprise', 'annual'), 863000)
})

// ---------------------------------------------------------------------------
// Pure math: status mapping + access
// ---------------------------------------------------------------------------
test('licenses: Stripe status maps to licenses status correctly', () => {
  assert.equal(licenseStatusFromStripe('active'), 'active')
  assert.equal(licenseStatusFromStripe('trialing'), 'trialing')
  assert.equal(licenseStatusFromStripe('past_due'), 'past_due')
  assert.equal(licenseStatusFromStripe('unpaid'), 'past_due')
  assert.equal(licenseStatusFromStripe('incomplete'), 'past_due')
  assert.equal(licenseStatusFromStripe('canceled'), 'canceled')
  assert.equal(licenseStatusFromStripe('incomplete_expired'), 'canceled')
})

test('licenses: access granted only for active/trialing', () => {
  assert.ok(licenseAccessGranted('active'))
  assert.ok(licenseAccessGranted('trialing'))
  assert.ok(!licenseAccessGranted('past_due'))
  assert.ok(!licenseAccessGranted('canceled'))
})

// ---------------------------------------------------------------------------
// Stripe price lookup keys (idempotent get-or-create contract)
// ---------------------------------------------------------------------------
test('licenses: lookup keys are stable and plan/cycle specific', () => {
  assert.equal(licenseBaseLookupKey('professional', 'monthly'), 'crm_base_professional_monthly')
  assert.equal(licenseBaseLookupKey('professional', 'annual'), 'crm_base_professional_annual')
  assert.equal(licenseBaseLookupKey('enterprise', 'monthly'), 'crm_base_enterprise_monthly')
  assert.equal(licenseBaseLookupKey('enterprise', 'annual'), 'crm_base_enterprise_annual')
  assert.equal(licenseSeatLookupKey('monthly'), 'crm_seat_monthly')
  assert.equal(licenseSeatLookupKey('annual'), 'crm_seat_annual')
})

test('licenses: server lib creates prices by lookup key and prorates seat changes', () => {
  assert.match(lib, /findPriceByLookupKey/)
  assert.match(lib, /createPrice/)
  assert.match(lib, /ensureLicensePrices/)
  assert.match(lib, /proration_behavior/, 'create_prorations')
  assert.match(lib, /updateLicenseSeatsOnStripe/)
  assert.match(lib, /setLicenseCancelAtPeriodEnd/)
})

// ---------------------------------------------------------------------------
// Schema: idempotent, agency-unique, RLS-scoped, anon revoked
// ---------------------------------------------------------------------------
test('licenses: schema is idempotent, agency-scoped, RLS-on', () => {
  assert.match(schema, /create table if not exists public\.licenses/)
  assert.match(schema, /agency_id\s+uuid not null unique references public\.agencies\(id\) on delete cascade/)
  assert.match(schema, /seats\s+integer not null default 3 check \(seats >= 3\)/)
  assert.match(schema, /cancel_at_period_end\s+boolean not null default false/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /status in \('active', 'past_due', 'canceled', 'trialing'\)/)
  assert.match(schema, /billing_cycle in \('monthly', 'annual'\)/)
})

// ---------------------------------------------------------------------------
// Checkout route: auth-gated, builds subscription mode checkout
// ---------------------------------------------------------------------------
test('licenses: checkout route auth-gates and targets license_subscription', () => {
  assert.match(checkoutRoute, /authenticateProfileRequest/)
  assert.match(checkoutRoute, /canManageAgency/)
  assert.match(checkoutRoute, /createLicenseCheckout/)
  assert.match(checkoutRoute, /body\.billingCycle === 'annual' \? 'annual' : 'monthly'/)
  assert.match(checkoutRoute, /Math\.max\(LICENSE_SEATS_INCLUDED/)
  assert.match(checkoutRoute, /stripe_customer/)
})

// ---------------------------------------------------------------------------
// Management route: seats / cancel / resume actions
// ---------------------------------------------------------------------------
test('licenses: management route handles seats + cancel + resume', () => {
  assert.match(manageRoute, /action === 'seats'/)
  assert.match(manageRoute, /updateLicenseSeatsOnStripe/)
  assert.match(manageRoute, /action === 'cancel' \|\| action === 'resume'/)
  assert.match(manageRoute, /setLicenseCancelAtPeriodEnd/)
  assert.match(manageRoute, /cancel_at_period_end/)
})

// ---------------------------------------------------------------------------
// Webhook: lifecycle sync + checkout completion + unlock
// ---------------------------------------------------------------------------
test('licenses: webhook syncs subscription lifecycle events', () => {
  assert.match(webhook, /type === 'customer\.subscription\.created' \|\| type === 'customer\.subscription\.updated'/)
  assert.match(webhook, /syncLicenseFromStripeSubscription/)
  assert.match(webhook, /customer\.subscription\.deleted/)
  assert.match(webhook, /handleLicenseSubscriptionDeleted/)
  assert.match(webhook, /invoice\.payment_failed/)
  assert.match(webhook, /invoice\.paid/)
})

test('licenses: webhook activates license on checkout completion + unlocks agency', () => {
  assert.match(webhook, /kind === 'license_subscription'/)
  assert.match(webhook, /from\('licenses'\)\.upsert/)
  assert.match(webhook, /onConflict: 'agency_id'/)
  assert.match(webhook, /paid_plan_active: true/)
  assert.match(webhook, /3 included \+ \$\{seats - 3\} add-on/)
  assert.match(webhook, /subscription_history/)
})

test('licenses: webhook extends period on renewal (invoice.paid)', () => {
  assert.match(webhook, /fetchLicenseByStripeSub\(stripeSub\)/)
  assert.match(webhook, /current_period_end: periodEnd/)
  assert.match(webhook, /syncAgencyAccessFromLicense\(license\.agency_id, 'active'\)/)
})

// ---------------------------------------------------------------------------
// UI panel: self-serve seats, checkout, cancel/resume
// ---------------------------------------------------------------------------
test('licenses: panel renders plan/cycle/seats + checkout + cancel controls', () => {
  assert.match(panel, /LICENSE_SEATS_INCLUDED/)
  assert.match(panel, /license-subscription\/checkout/)
  assert.match(panel, /action: 'seats'/)
  assert.match(panel, /action: cancel \? 'cancel' : 'resume'/)
  assert.match(panel, /Cancel at period end/)
  assert.match(panel, /Resume subscription/)
  assert.match(panel, /SEAT_ADDON_MONTHLY/)
})
