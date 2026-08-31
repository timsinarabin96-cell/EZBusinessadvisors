/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// License subscriptions — server-side orchestration (Phase 3).
// -----------------------------------------------------------------------------
// Recurring CRM subscriptions on the `licenses` table (source of truth):
//   - Idempotent Stripe Price creation via lookup keys (no dashboard setup)
//   - Subscription Checkout (base plan qty 1 + seat add-on qty N)
//   - Seat changes with proration (create_prorations on the subscription)
//   - Cancel at period end / resume
//   - Webhook sync helpers (customer.subscription.created/updated/deleted)
// Uses the Stripe REST API directly (no SDK dependency) — same pattern as
// lib/stripeCheckout.ts. Server-only.
// =============================================================================

import { createServerClient } from '@/lib/supabase/server'
import { stripeConfigured } from '@/lib/stripeCheckout'
import {
  type LicensePlanType, type LicenseBillingCycle, type LicenseStatus,
  licenseBaseLookupKey, licenseSeatLookupKey, licenseBaseProductName,
  licenseSeatProductName, licenseBaseCents, licenseSeatAddonCents,
  seatAddonQty, totalSeatsFromAddon, licenseStatusFromStripe,
  licenseAccessGranted,
} from '@/lib/licenseSubscriptionsCore'

const STRIPE_API = 'https://api.stripe.com/v1'

// --- Types -------------------------------------------------------------------
export interface LicenseRow {
  id: string
  agency_id: string
  plan_type: LicensePlanType
  billing_cycle: LicenseBillingCycle
  status: LicenseStatus
  seats: number
  stripe_customer: string | null
  stripe_subscription: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  cancel_at: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface LicensePriceIds {
  basePriceId: string
  seatPriceId: string
}

// --- Stripe REST helpers ------------------------------------------------------
async function stripeRequest(path: string, params: URLSearchParams, method = 'POST') {
  const key = process.env.STRIPE_SECRET_KEY || ''
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`)
  return data
}

async function stripeGet(path: string) {
  const key = process.env.STRIPE_SECRET_KEY || ''
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`)
  return data
}

/** Find a price by lookup_key (idempotent). */
async function findPriceByLookupKey(lookupKey: string): Promise<string | null> {
  const data = await stripeGet(`/prices?lookup_keys=${encodeURIComponent(lookupKey)}&limit=1&active=true`)
  const list = data?.data || []
  return list[0]?.id || null
}

/** Create a recurring price (idempotent by lookup key). */
async function createPrice(opts: {
  lookupKey: string
  unitAmountCents: number
  interval: 'month' | 'year'
  productName: string
}): Promise<string> {
  const params = new URLSearchParams()
  params.set('lookup_key', opts.lookupKey)
  params.set('currency', 'usd')
  params.set('unit_amount', String(opts.unitAmountCents))
  params.set('recurring[interval]', opts.interval)
  params.set('product_data[name]', opts.productName)
  const data = await stripeRequest('/prices', params)
  return data.id as string
}

/**
 * Get-or-create the base + seat prices for a plan/cycle.
 * Returns real Stripe Price IDs so seat changes can re-use the same price
 * (required for proration on subscription-item quantity updates).
 */
export async function ensureLicensePrices(planType: LicensePlanType, cycle: LicenseBillingCycle): Promise<LicensePriceIds> {
  const baseKey = licenseBaseLookupKey(planType, cycle)
  const seatKey = licenseSeatLookupKey(cycle)
  const baseInterval = cycle === 'annual' ? 'year' : 'month'

  let basePriceId = await findPriceByLookupKey(baseKey)
  if (!basePriceId) {
    basePriceId = await createPrice({
      lookupKey: baseKey,
      unitAmountCents: licenseBaseCents(planType, cycle),
      interval: baseInterval,
      productName: licenseBaseProductName(planType),
    })
  }

  let seatPriceId = await findPriceByLookupKey(seatKey)
  if (!seatPriceId) {
    seatPriceId = await createPrice({
      lookupKey: seatKey,
      unitAmountCents: licenseSeatAddonCents(cycle),
      interval: baseInterval,
      productName: licenseSeatProductName(),
    })
  }

  return { basePriceId, seatPriceId }
}

// --- Checkout ----------------------------------------------------------------
export interface LicenseCheckoutInput {
  agencyId: string
  planType: LicensePlanType
  billingCycle: LicenseBillingCycle
  seats: number
  successUrl: string
  cancelUrl: string
  customerEmail?: string | null
  /** Existing Stripe customer id (reuse for upgrades/switches). */
  customer?: string | null
}

export async function createLicenseCheckout(input: LicenseCheckoutInput): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!stripeConfigured()) {
    return { ok: false, error: 'Stripe is not connected yet. Add STRIPE_SECRET_KEY to enable live subscriptions.' }
  }

  try {
    const prices = await ensureLicensePrices(input.planType, input.billingCycle)
    const addonQty = seatAddonQty(input.seats)

    const params = new URLSearchParams()
    params.set('mode', 'subscription')
    params.set('success_url', input.successUrl)
    params.set('cancel_url', input.cancelUrl)
    params.set('client_reference_id', input.agencyId)
    if (input.customer) params.set('customer', input.customer)
    else if (input.customerEmail) params.set('customer_email', input.customerEmail)
    params.set('metadata[kind]', 'license_subscription')
    params.set('metadata[agencyId]', input.agencyId)
    params.set('metadata[planType]', input.planType)
    params.set('metadata[billingCycle]', input.billingCycle)
    params.set('metadata[seats]', String(input.seats))

    // Base plan line item (qty 1).
    params.set('line_items[0][price]', prices.basePriceId)
    params.set('line_items[0][quantity]', '1')
    // Seat add-on line item — only when over the 3 included seats.
    if (addonQty > 0) {
      params.set('line_items[1][price]', prices.seatPriceId)
      params.set('line_items[1][quantity]', String(addonQty))
    }

    const data = await stripeRequest('/checkout/sessions', params)
    return { ok: true, url: data.url as string }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Stripe checkout failed' }
  }
}

// --- Seat changes (prorated) --------------------------------------------------
interface StripeSubItem { id: string; price?: { lookup_key?: string | null } | null; quantity?: number }

/** Update the seat add-on item quantity on the Stripe subscription, prorated. */
export async function updateLicenseSeatsOnStripe(stripeSubId: string, cycle: LicenseBillingCycle, newSeats: number): Promise<void> {
  const sub = await stripeGet(`/subscriptions/${stripeSubId}`)
  const items: StripeSubItem[] = sub?.items?.data || []
  const seatKey = licenseSeatLookupKey(cycle)
  const seatItem = items.find((it) => it.price?.lookup_key === seatKey)
  const addonQty = seatAddonQty(newSeats)

  if (addonQty === 0) {
    // Remove the seat item entirely (prorated refund).
    if (seatItem) {
      await stripeRequest(`/subscriptions/${stripeSubId}/items/${seatItem.id}`, new URLSearchParams(), 'DELETE')
    }
    return
  }

  if (seatItem) {
    // Quantity change on the existing item → prorated.
    const params = new URLSearchParams()
    params.set('proration_behavior', 'create_prorations')
    params.set('quantity', String(addonQty))
    await stripeRequest(`/subscriptions/${stripeSubId}/items/${seatItem.id}`, params, 'POST')
  } else {
    // No seat item yet (was at 3 seats) → add one, prorated.
    const prices = await ensureLicensePrices(sub?.metadata?.planType === 'enterprise' ? 'enterprise' : 'professional', cycle)
    const params = new URLSearchParams()
    params.set('price', prices.seatPriceId)
    params.set('quantity', String(addonQty))
    params.set('proration_behavior', 'create_prorations')
    await stripeRequest(`/subscriptions/${stripeSubId}/items`, params, 'POST')
  }
}

// --- Cancel / resume -----------------------------------------------------------
export async function setLicenseCancelAtPeriodEnd(stripeSubId: string, cancel: boolean): Promise<{ cancelAt: string | null }> {
  const params = new URLSearchParams()
  params.set('cancel_at_period_end', cancel ? 'true' : 'false')
  const data = await stripeRequest(`/subscriptions/${stripeSubId}`, params, 'POST')
  return { cancelAt: data?.cancel_at ? new Date(data.cancel_at * 1000).toISOString() : null }
}

// --- DB helpers -----------------------------------------------------------------
export async function fetchLicenseByAgency(agencyId: string): Promise<LicenseRow | null> {
  const db = createServerClient()
  if (!db) return null
  const { data } = await db.from('licenses').select('*').eq('agency_id', agencyId).maybeSingle()
  return (data as LicenseRow) || null
}

export async function fetchLicenseByStripeSub(stripeSub: string): Promise<LicenseRow | null> {
  const db = createServerClient()
  if (!db) return null
  const { data } = await db.from('licenses').select('*').eq('stripe_subscription', stripeSub).maybeSingle()
  return (data as LicenseRow) || null
}

export async function fetchLicenseByCustomer(customer: string): Promise<LicenseRow | null> {
  const db = createServerClient()
  if (!db) return null
  const { data } = await db.from('licenses').select('*').eq('stripe_customer', customer).maybeSingle()
  return (data as LicenseRow) || null
}

/** Sync agency access from a license row (unlock = paid_plan_active). */
export async function syncAgencyAccessFromLicense(agencyId: string, status: LicenseStatus): Promise<void> {
  const db = createServerClient()
  if (!db) return
  const unlocked = licenseAccessGranted(status)
  const patch: Record<string, unknown> = {
    paid_plan_active: unlocked,
    trial_active: false,
  }
  if (unlocked) {
    // Full unlock: clear every lock/grace signal, mark plan as license.
    patch.locked_at = null
    patch.archive_at = null
    patch.grace_end_date = null
    patch.plan_type = 'license'
  } else {
    // Locked: mirror the existing 7-day grace so data survives until renewal.
    patch.grace_end_date = new Date(Date.now() + 7 * 86400000).toISOString()
  }
  await db.from('agencies').update(patch).eq('id', agencyId)
}

// --- Webhook sync ---------------------------------------------------------------
/**
 * Sync a `licenses` row from a Stripe subscription object (created/updated).
 * Computes seats from the seat add-on item (qty + 3 included) so Stripe stays
 * the source of truth for billing while licenses mirrors it for access.
 */
export async function syncLicenseFromStripeSubscription(sub: any): Promise<LicenseRow | null> {
  const db = createServerClient()
  if (!db) return null

  const stripeSubId = String(sub?.id || '')
  if (!stripeSubId) return null

  const metadata = sub?.metadata || {}
  const cycle: LicenseBillingCycle = metadata?.billingCycle === 'annual' ? 'annual' : 'monthly'
  const planType: LicensePlanType = metadata?.planType === 'enterprise' ? 'enterprise' : 'professional'

  // Find the existing row by stripe subscription, then customer, then agency.
  let license = await fetchLicenseByStripeSub(stripeSubId)
  let agencyId = metadata?.agencyId || license?.agency_id || null
  if (!license && !agencyId && sub?.customer) {
    const byCustomer = await fetchLicenseByCustomer(String(sub.customer))
    license = byCustomer
    agencyId = license?.agency_id || agencyId
  }

  // Seats from the seat add-on item quantity (3 included).
  const items: StripeSubItem[] = sub?.items?.data || []
  const seatKey = licenseSeatLookupKey(cycle)
  const seatItem = items.find((it) => it.price?.lookup_key === seatKey)
  const seats = totalSeatsFromAddon(Number(seatItem?.quantity || 0))

  const status = licenseStatusFromStripe(String(sub?.status || ''))

  const periodStart = sub?.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : license?.current_period_start || null
  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : license?.current_period_end || null
  const cancelAtPeriodEnd = !!sub?.cancel_at_period_end
  const cancelAt = sub?.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null

  const row = {
    agency_id: agencyId || undefined,
    plan_type: planType,
    billing_cycle: cycle,
    status,
    seats,
    stripe_customer: sub?.customer || license?.stripe_customer || null,
    stripe_subscription: stripeSubId,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    cancel_at_period_end: cancelAtPeriodEnd,
    cancel_at: cancelAt,
    updated_at: new Date().toISOString(),
  }

  let saved: LicenseRow | null = null
  if (license?.id) {
    const { data } = await db.from('licenses').update(row).eq('id', license.id).select().maybeSingle()
    saved = (data as LicenseRow) || null
  } else if (agencyId) {
    const { data } = await db.from('licenses').upsert({ ...row, agency_id: agencyId }, { onConflict: 'agency_id' }).select().maybeSingle()
    saved = (data as LicenseRow) || null
  } else {
    return null
  }

  // Unlock / lock the agency to match.
  if (saved?.agency_id) {
    await syncAgencyAccessFromLicense(saved.agency_id, saved.status)
  }
  return saved
}

/** Handle customer.subscription.deleted → cancel the license + revoke access. */
export async function handleLicenseSubscriptionDeleted(stripeSubId: string): Promise<void> {
  const db = createServerClient()
  if (!db) return
  const license = await fetchLicenseByStripeSub(stripeSubId)
  if (!license) return
  await db.from('licenses').update({
    status: 'canceled',
    cancel_at_period_end: false,
    updated_at: new Date().toISOString(),
  }).eq('id', license.id)
  await syncAgencyAccessFromLicense(license.agency_id, 'canceled')
}
