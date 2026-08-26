/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Co-Brokerage Syndication Network
// -----------------------------------------------------------------------------
// Brokers offer listings to other brokers/agencies as co-brokerage deals with
// a defined commission split. Accepting marks the listing jointly represented;
// the platform tracks splits automatically. Network effects: every broker in
// the network sees more deals and more buyers → the "MLS of business sales".
// =============================================================================

import { supabase } from '@/lib/supabase/client'
import { getAgencyContext } from '@/lib/agencyContext'
import { createNotification } from '@/lib/notifications'

export type SyndicationStatus = 'offered' | 'accepted' | 'declined' | 'withdrawn'

export interface SyndicationOffer {
  id: string
  listing_id: string
  from_agency_id: string
  to_agency_id: string
  to_profile_id: string | null
  split_pct: number
  status: SyndicationStatus
  note: string | null
  responded_at: string | null
  created_at: string
  listing?: {
    id: string
    business_name: string | null
    listing_ref: string | null
    asking_price: number | null
    industry: string | null
    location_general: string | null
  } | null
  from_agency?: { name: string | null } | null
  to_agency?: { name: string | null } | null
  to_broker?: { public_name: string | null } | null
}

const SELECT = `
  id, listing_id, from_agency_id, to_agency_id, to_profile_id, split_pct, status,
  note, responded_at, created_at,
  listing:listings(id, business_name, listing_ref, asking_price, industry, location_general),
  from_agency:agencies!syndication_offers_from_agency_id_fkey(name),
  to_agency:agencies!syndication_offers_to_agency_id_fkey(name),
  to_broker:broker_profiles!syndication_offers_to_profile_id_fkey(public_name)
`

/** Offers sent TO my agency (inbox) — offered + accepted, newest first. */
export async function fetchSyndicationInbox(): Promise<SyndicationOffer[]> {
  const ctx = await getAgencyContext()
  if (!ctx) return []
  const { data } = await supabase
    .from('syndication_offers')
    .select(SELECT)
    .eq('to_agency_id', ctx.agencyId)
    .in('status', ['offered', 'accepted'])
    .order('created_at', { ascending: false })
  return (data || []) as unknown as SyndicationOffer[]
}

/** Offers I sent (outbox) — newest first. */
export async function fetchSyndicationOutbox(): Promise<SyndicationOffer[]> {
  const ctx = await getAgencyContext()
  if (!ctx) return []
  const { data } = await supabase
    .from('syndication_offers')
    .select(SELECT)
    .eq('from_agency_id', ctx.agencyId)
    .order('created_at', { ascending: false })
  return (data || []) as unknown as SyndicationOffer[]
}

export interface SyndicationStats {
  incoming: number
  outgoing: number
  accepted: number
}

export async function fetchSyndicationStats(): Promise<SyndicationStats> {
  const ctx = await getAgencyContext()
  if (!ctx) return { incoming: 0, outgoing: 0, accepted: 0 }
  const { data } = await supabase
    .from('syndication_offers')
    .select('id, status, from_agency_id, to_agency_id')
  const rows = data || []
  return {
    incoming: rows.filter((r) => r.to_agency_id === ctx.agencyId && r.status === 'offered').length,
    outgoing: rows.filter((r) => r.from_agency_id === ctx.agencyId && r.status === 'offered').length,
    accepted: rows.filter((r) => r.status === 'accepted' && (r.from_agency_id === ctx.agencyId || r.to_agency_id === ctx.agencyId)).length,
  }
}

export interface SyndicationInput {
  listingId: string
  toProfileId: string | null
  splitPct: number
  note?: string
}

/** Offer a listing to another broker/agency as co-brokerage. */
export async function offerListing(input: SyndicationInput): Promise<{ ok: boolean; error?: string; id?: string }> {
  const ctx = await getAgencyContext()
  if (!ctx) return { ok: false, error: 'Not signed in to an agency' }
  if (!input.listingId) return { ok: false, error: 'Listing is required' }
  if (!input.toProfileId) return { ok: false, error: 'Choose a broker to syndicate to' }
  const split = Number(input.splitPct)
  if (!Number.isFinite(split) || split < 0 || split > 100) return { ok: false, error: 'Split must be 0–100%' }

  // Resolve the target broker's agency.
  const { data: broker } = await supabase
    .from('broker_profiles')
    .select('profile_id, agency_id, public_name')
    .eq('profile_id', input.toProfileId)
    .maybeSingle()
  if (!broker || !broker.agency_id) return { ok: false, error: 'Broker not found or not attached to an agency' }
  if (broker.agency_id === ctx.agencyId) return { ok: false, error: 'You cannot syndicate to your own agency' }

  // Verify the listing belongs to my agency.
  const { data: listing } = await supabase
    .from('listings')
    .select('id, agency_id, business_name')
    .eq('id', input.listingId)
    .eq('agency_id', ctx.agencyId)
    .maybeSingle()
  if (!listing) return { ok: false, error: 'Listing not found in your agency' }

  const { data, error } = await supabase
    .from('syndication_offers')
    .insert({
      listing_id: input.listingId,
      from_agency_id: ctx.agencyId,
      to_agency_id: broker.agency_id,
      to_profile_id: input.toProfileId,
      split_pct: split,
      note: input.note || null,
      status: 'offered',
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  await createNotification({
    agency_id: broker.agency_id,
    profile_id: input.toProfileId,
    title: '🤝 Co-brokerage offer received',
    body: `${listing.business_name || 'A listing'} was offered to you with a ${split}% split.`,
    kind: 'syndication',
    link: '/dashboard/syndication',
  })

  return { ok: true, id: data.id }
}

/** Accept or decline an incoming offer. */
export async function respondToOffer(id: string, status: 'accepted' | 'declined'): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getAgencyContext()
  if (!ctx) return { ok: false, error: 'Not signed in to an agency' }
  const { error } = await supabase
    .from('syndication_offers')
    .update({ status, responded_at: new Date().toISOString() })
    .eq('id', id)
    .eq('to_agency_id', ctx.agencyId)
    .eq('status', 'offered')
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Withdraw an offer I sent (only while still offered). */
export async function withdrawOffer(id: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getAgencyContext()
  if (!ctx) return { ok: false, error: 'Not signed in to an agency' }
  const { error } = await supabase
    .from('syndication_offers')
    .update({ status: 'withdrawn' })
    .eq('id', id)
    .eq('from_agency_id', ctx.agencyId)
    .eq('status', 'offered')
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Resolve an offer's target broker profile id → for the offer form picker. */
export async function fetchMyListingsForSyndication(): Promise<{ id: string; business_name: string | null; listing_ref: string | null; asking_price: number | null }[]> {
  const ctx = await getAgencyContext()
  if (!ctx) return []
  const { data } = await supabase
    .from('listings')
    .select('id, business_name, listing_ref, asking_price')
    .eq('agency_id', ctx.agencyId)
    .order('created_at', { ascending: false })
  return (data || []) as { id: string; business_name: string | null; listing_ref: string | null; asking_price: number | null }[]
}
