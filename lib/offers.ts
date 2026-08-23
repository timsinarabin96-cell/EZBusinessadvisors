// =============================================================================
// Deal Offer Lab — create, evaluate, and manage buyer offers
// -----------------------------------------------------------------------------
// Offers reference a listing + buyer lead, carry price/terms, and get an AI
// seller-value score. Brokers build offers in the lab, then submit for seller
// review. Server-only.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface OfferInput {
  listing_id: string
  buyer_lead_id?: string | null
  deal_id?: string | null
  purchase_price?: number | null
  cash_at_closing?: number | null
  seller_note?: number | null
  earnout_amount?: number | null
  financing_contingency?: boolean
  diligence_days?: number | null
  training_days?: number | null
  terms?: Record<string, unknown>
}

/** Heuristic seller-value score (0-100) — higher is better for the seller. */
export function scoreOffer(o: {
  purchase_price?: number | null
  cash_at_closing?: number | null
  seller_note?: number | null
  earnout_amount?: number | null
  financing_contingency?: boolean
  diligence_days?: number | null
  training_days?: number | null
}): number {
  let score = 0
  const total = (o.purchase_price || 0) + (o.earnout_amount || 0)
  if (total > 0) {
    // Cash-heavy offers score higher than seller-financed ones.
    const cash = o.cash_at_closing || 0
    score += Math.min(50, Math.round((cash / total) * 50))
    // Seller note reduces value (deferral risk).
    const note = o.seller_note || 0
    score -= Math.round((note / total) * 20)
  }
  if (!o.financing_contingency) score += 15
  if ((o.diligence_days || 45) <= 45) score += 10
  if ((o.training_days || 30) >= 30) score += 10
  if ((o.earnout_amount || 0) > 0) score += 5
  return Math.max(0, Math.min(100, score))
}

/** Create a draft offer in the lab. */
export async function createOffer(input: OfferInput): Promise<{ ok: boolean; error?: string; offer?: Record<string, unknown> }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  if (!input.listing_id) return { ok: false, error: 'listing_id is required' }

  const { data: listing } = await svc.from('listings').select('agency_id').eq('id', input.listing_id).maybeSingle()
  if (!listing?.agency_id) return { ok: false, error: 'Listing not found' }

  const { data, error } = await svc
    .from('deal_offers')
    .insert({
      agency_id: listing.agency_id,
      listing_id: input.listing_id,
      deal_id: input.deal_id || null,
      buyer_lead_id: input.buyer_lead_id || null,
      status: 'draft',
      purchase_price: input.purchase_price ?? null,
      cash_at_closing: input.cash_at_closing ?? null,
      seller_note: input.seller_note ?? null,
      earnout_amount: input.earnout_amount ?? null,
      financing_contingency: input.financing_contingency ?? false,
      diligence_days: input.diligence_days ?? null,
      training_days: input.training_days ?? null,
      terms: input.terms || {},
      seller_value_score: scoreOffer(input),
      closing_probability: 0,
    })
    .select()
    .single()

  if (error) return { ok: false, error: error.message || 'Failed to create offer' }
  return { ok: true, offer: data as Record<string, unknown> }
}

/** Fetch offers for an agency, optionally filtered by listing. */
export async function fetchOffers(agencyId: string, listingId?: string): Promise<Record<string, unknown>[]> {
  if (!svc) return []
  let q = svc
    .from('deal_offers')
    .select('*, listings(business_name, asking_price), buyer_leads(full_name, company)')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (listingId) q = q.eq('listing_id', listingId)
  const { data, error } = await q
  if (error) return []
  return (data || []) as Record<string, unknown>[]
}

/** Update an offer's status (submit for seller review, accept, reject). */
export async function updateOfferStatus(
  agencyId: string,
  offerId: string,
  status: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { error } = await svc
    .from('deal_offers')
    .update({ status, submitted_at: status === 'submitted' ? new Date().toISOString() : undefined })
    .eq('id', offerId)
    .eq('agency_id', agencyId)
  if (error) return { ok: false, error: error.message || 'Failed to update offer' }
  return { ok: true }
}
