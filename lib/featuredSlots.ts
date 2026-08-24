// =============================================================================
// Featured listing slots — brokers pay for 30-day featured placement.
// The listing is flagged is_featured (sorts to top of public feed + homepage
// carousel) for the purchased window. Purchases go through Stripe Checkout
// (demo fallback records + activates immediately when Stripe is unset).
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export const FEATURED_SLOT_OPTIONS = [
  { id: 'featured_30', label: 'Featured 30 days', priceCents: 14900, days: 30, description: 'Top of the public feed + homepage carousel for 30 days' },
  { id: 'featured_90', label: 'Featured 90 days', priceCents: 34900, days: 90, description: 'Top placement for 90 days — best value' },
  { id: 'featured_spotlight', label: 'Spotlight + Newspaper', priceCents: 49900, days: 30, description: 'Featured placement + weekly newspaper spotlight' },
] as const

export interface FeaturedSlot {
  id: string
  agency_id: string
  listing_id: string
  amount_cents: number
  days: number
  starts_at: string
  ends_at: string
  status: string
}

/** Activate a featured slot on a listing (sets is_featured + featured_until). */
export async function activateFeaturedSlot(
  agencyId: string,
  listingId: string,
  optionId: string,
  opts: { stripeSession?: string; immediate?: boolean } = {},
): Promise<{ ok: boolean; error?: string; slot?: FeaturedSlot }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const option = FEATURED_SLOT_OPTIONS.find((o) => o.id === optionId)
  if (!option) return { ok: false, error: 'Unknown featured slot option' }

  const now = Date.now()
  const startsAt = new Date(now).toISOString()
  const endsAt = new Date(now + option.days * 86400000).toISOString()
  const status = opts.immediate ? 'active' : 'pending'

  const { data, error } = await svc
    .from('featured_slots')
    .insert({
      agency_id: agencyId,
      listing_id: listingId,
      amount_cents: option.priceCents,
      days: option.days,
      starts_at: startsAt,
      ends_at: endsAt,
      status,
      stripe_session: opts.stripeSession || null,
    })
    .select()
    .single()

  if (error) return { ok: false, error: error.message }

  // When paid/immediate, flip the listing to featured right away.
  if (status === 'active') {
    await svc
      .from('listings')
      .update({ is_featured: true, featured_until: endsAt })
      .eq('id', listingId)
  }

  return { ok: true, slot: data as FeaturedSlot }
}

/** Mark a slot active + feature the listing (called by the Stripe webhook). */
export async function confirmFeaturedSlot(stripeSession: string): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { data: slot } = await svc
    .from('featured_slots')
    .select('*')
    .eq('stripe_session', stripeSession)
    .maybeSingle()
  if (!slot) return { ok: false, error: 'Featured slot not found for session' }

  await svc.from('featured_slots').update({ status: 'active' }).eq('id', slot.id)
  await svc
    .from('listings')
    .update({ is_featured: true, featured_until: slot.ends_at })
    .eq('id', slot.listing_id)
  return { ok: true }
}

/** List featured slots for an agency (admin view). */
export async function fetchFeaturedSlots(agencyId: string): Promise<FeaturedSlot[]> {
  if (!svc) return []
  const { data } = await svc
    .from('featured_slots')
    .select('*, listings(business_name)')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data as FeaturedSlot[]) || []
}
