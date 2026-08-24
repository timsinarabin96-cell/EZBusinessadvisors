// =============================================================================
// Seller Self-Service Listing Orders (pay-to-list)
// -----------------------------------------------------------------------------
// A seller picks a listing plan (Launch / Qualified / Broker Assisted), pays a
// one-time fee, and their business goes into the broker review queue as a draft
// listing. The broker approves before anything becomes public. Server-only.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { OWNER_LISTING_PLANS } from '@/lib/listingIntelligence'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export type ListingPlanId = 'free' | 'professional' | 'enterprise'

export interface SellerListingDraft {
  business_name: string
  industry?: string | null
  location_general?: string | null
  description?: string | null
  asking_price?: number | null
  annual_revenue?: number | null
  sde?: number | null
  seller_email: string
  seller_name?: string | null
  seller_phone?: string | null
}

export interface OrderResult {
  ok: boolean
  order?: Record<string, unknown>
  listing?: Record<string, unknown>
  error?: string
}

export const getPlan = (id: string) => OWNER_LISTING_PLANS.find((p) => p.id === id)

const isRelationMissing = (err: unknown): boolean =>
  typeof err === 'object' && err !== null &&
  !!((err as { message?: string }).message ?? '').match(/relation .* does not exist|Could not find the table/i)

/**
 * Creates a seller listing order (pay-to-list). Records the order and creates
 * a DRAFT listing in the broker review queue — never published automatically.
 *
 * @param agencyId  The brokerage agency receiving this listing.
 * @param planId    launch | qualified | broker_assisted
 * @param draft     Public seller-provided listing details.
 * @param opts      provider session (e.g. Stripe checkout id) when payment is
 *                  collected online; otherwise order is 'pending' for manual
 *                  payment.
 */
export async function createSellerListingOrder(
  agencyId: string,
  planId: ListingPlanId,
  draft: SellerListingDraft,
  opts: { provider?: string; providerSessionId?: string; status?: string } = {},
): Promise<OrderResult> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const plan = getPlan(planId)
  if (!plan) return { ok: false, error: 'Unknown listing plan' }
  if (!draft.business_name?.trim()) return { ok: false, error: 'Business name is required' }
  if (!draft.seller_email?.trim()) return { ok: false, error: 'Seller email is required' }

  // 1) Create the draft listing (status: draft; confidentiality: broker_only so
  //    nothing sensitive is exposed while awaiting broker review).
  const { data: listing, error: listingError } = await svc
    .from('listings')
    .insert({
      agency_id: agencyId,
      business_name: draft.business_name.trim().slice(0, 200),
      industry: draft.industry?.trim().slice(0, 100) || null,
      location_general: draft.location_general?.trim().slice(0, 200) || null,
      description: draft.description?.trim().slice(0, 4000) || null,
      asking_price: draft.asking_price ?? null,
      annual_revenue: draft.annual_revenue ?? null,
      sde: draft.sde ?? null,
      status: 'draft',
      confidentiality_level: 'broker_only',
      intake_source: 'seller_self_service',
      compliance_status: 'pending',
      ai_readiness_score: 0,
    })
    .select()
    .single()

  if (listingError) return { ok: false, error: listingError.message || 'Failed to create listing' }

  // 2) Record the paid order.
  const { data: order, error: orderError } = await svc
    .from('seller_listing_orders')
    .insert({
      agency_id: agencyId,
      listing_id: listing.id,
      plan_code: planId,
      amount_cents: Math.round(plan.price * 100),
      status: opts.status || 'pending',
      provider: opts.provider || null,
      provider_session_id: opts.providerSessionId || null,
      starts_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 90 * 86400000).toISOString(),
    })
    .select()
    .single()

  if (orderError) {
    // Roll back the listing so we never orphan a draft with no order.
    await svc.from('listings').delete().eq('id', listing.id)
    if (isRelationMissing(orderError)) {
      return { ok: false, error: 'Listing orders are not set up yet — run the seller listing schema.' }
    }
    return { ok: false, error: orderError.message || 'Failed to create order' }
  }

  return { ok: true, order: order as Record<string, unknown>, listing: listing as Record<string, unknown> }
}

/** Resolve the receiving agency for seller self-service (default or by slug). */
export async function resolveListingAgency(slug?: string): Promise<string | null> {
  if (!svc) return null
  if (slug) {
    const { data } = await svc.from('agencies').select('id').eq('slug', slug).maybeSingle()
    if (data) return data.id
  }
  const { data } = await svc.from('agencies').select('id').eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id || null
}
