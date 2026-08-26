/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Cross-Agency Lead Marketplace — the B2B2C platform play.
// Agencies list qualified buyer leads for sale (anonymized); other agencies
// browse and buy them; every purchase is recorded in a ledger with the fee.
// Stored in platform_settings JSONB (key/value) so no DDL is required —
// same pattern as push subscriptions.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

const LISTINGS_KEY = 'lead_marketplace_listings'
const LEDGER_KEY = 'lead_marketplace_ledger'

// ---------------------------------------------------------------------------
// Per-lead pricing tiers (monetization roadmap item).
// Every lead listing carries a tier; each tier has a suggested price band so
// the marketplace looks curated, plus a platform fee % that's recorded in the
// ledger on purchase (Concord takes a cut of every cross-agency lead sale).
// ---------------------------------------------------------------------------
export interface LeadTier {
  id: 'standard' | 'premium' | 'elite'
  label: string
  icon: string
  suggestedMin: number
  suggestedMax: number
  defaultPrice: number
  platformFeePct: number // Concord's cut of the sale
  description: string
}

export const LEAD_TIERS: LeadTier[] = [
  {
    id: 'standard', label: 'Standard', icon: '📇',
    suggestedMin: 25, suggestedMax: 100, defaultPrice: 49,
    platformFeePct: 15,
    description: 'Qualified buyer with contact info. Best for warm leads you can\'t serve.',
  },
  {
    id: 'premium', label: 'Premium', icon: '⭐',
    suggestedMin: 100, suggestedMax: 350, defaultPrice: 199,
    platformFeePct: 20,
    description: 'Verified funds + active timeline. Higher intent, faster close.',
  },
  {
    id: 'elite', label: 'Elite', icon: '💎',
    suggestedMin: 350, suggestedMax: 1000, defaultPrice: 499,
    platformFeePct: 25,
    description: 'Screened, funded, location-flexible. Rare — prices itself.',
  },
]

export const leadTierOf = (id: string | null | undefined): LeadTier => LEAD_TIERS.find((t) => t.id === id) || LEAD_TIERS[0]

export interface MarketLead {
  id: string
  seller_agency_id: string
  seller_agency_name: string | null
  lead_id: string            // the buyer_leads.id being sold
  industry: string | null
  location: string | null
  budget: string | null
  funds: string | null
  headline: string
  tier: 'standard' | 'premium' | 'elite'
  price_cents: number
  platform_fee_cents: number // recorded at publish (fee % × price)
  status: 'listed' | 'sold'
  created_at: string
  buyer_agency_id?: string | null
  buyer_agency_name?: string | null
  purchased_at?: string | null
}

export interface MarketPurchase {
  id: string
  listing_id: string
  lead_id: string
  seller_agency_id: string
  buyer_agency_id: string
  price_cents: number
  platform_fee_cents?: number
  status: 'pending' | 'paid'
  created_at: string
}

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))

async function readListings(): Promise<MarketLead[]> {
  if (!svc) return []
  const { data } = await svc.from('platform_settings').select('value').eq('key', LISTINGS_KEY).maybeSingle()
  return (data?.value as MarketLead[]) || []
}

async function writeListings(listings: MarketLead[]): Promise<boolean> {
  if (!svc) return false
  const { error } = await svc.from('platform_settings').upsert({ key: LISTINGS_KEY, value: listings }, { onConflict: 'key' })
  return !error
}

async function readLedger(): Promise<MarketPurchase[]> {
  if (!svc) return []
  const { data } = await svc.from('platform_settings').select('value').eq('key', LEDGER_KEY).maybeSingle()
  return (data?.value as MarketPurchase[]) || []
}

async function writeLedger(ledger: MarketPurchase[]): Promise<boolean> {
  if (!svc) return false
  const { error } = await svc.from('platform_settings').upsert({ key: LEDGER_KEY, value: ledger }, { onConflict: 'key' })
  return !error
}

/** Public browse — only listed (unsold) leads, no contact details. */
export async function browseMarketplace(limit = 40): Promise<MarketLead[]> {
  const listings = await readListings()
  return listings
    .filter((l) => l.status === 'listed')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
}

/** My agency's listed leads. */
export async function myMarketListings(agencyId: string): Promise<MarketLead[]> {
  const listings = await readListings()
  return listings.filter((l) => l.seller_agency_id === agencyId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

/** My agency's purchases. */
export async function myPurchases(agencyId: string): Promise<MarketPurchase[]> {
  const ledger = await readLedger()
  return ledger.filter((p) => p.buyer_agency_id === agencyId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

/** Publish a buyer lead for sale (anonymized teaser + price). */
export async function publishLead(input: {
  agencyId: string
  leadId: string
  industry?: string | null
  location?: string | null
  budget?: string | null
  funds?: string | null
  headline?: string
  tier?: 'standard' | 'premium' | 'elite'
  priceCents: number
}): Promise<{ ok: boolean; error?: string; listing?: MarketLead }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  if (input.priceCents <= 0) return { ok: false, error: 'Set a price above $0' }
  if (!input.leadId) return { ok: false, error: 'leadId is required' }

  const tier = leadTierOf(input.tier)
  // Price sanity vs tier band: warn on wildly off-band pricing, never block.
  const priceDollars = input.priceCents / 100
  if (priceDollars < tier.suggestedMin * 0.5 || priceDollars > tier.suggestedMax * 2) {
    return { ok: false, error: `Price is far outside the ${tier.label} tier band ($${tier.suggestedMin}–$${tier.suggestedMax}). Pick a closer tier or price.` }
  }
  const platformFeeCents = Math.round(input.priceCents * (tier.platformFeePct / 100))

  const { data: agency } = await svc.from('agencies').select('name').eq('id', input.agencyId).maybeSingle()
  const listings = await readListings()
  if (listings.some((l) => l.lead_id === input.leadId && l.status === 'listed')) {
    return { ok: false, error: 'This lead is already listed for sale' }
  }

  const listing: MarketLead = {
    id: uid(),
    seller_agency_id: input.agencyId,
    seller_agency_name: agency?.name || null,
    lead_id: input.leadId,
    industry: input.industry || null,
    location: input.location || null,
    budget: input.budget || null,
    funds: input.funds || null,
    headline: input.headline || 'Qualified buyer lead',
    tier: tier.id,
    price_cents: input.priceCents,
    platform_fee_cents: platformFeeCents,
    status: 'listed',
    created_at: new Date().toISOString(),
  }
  listings.push(listing)
  const ok = await writeListings(listings)
  return ok ? { ok: true, listing } : { ok: false, error: 'Failed to save listing' }
}

/** Withdraw my own listing. */
export async function withdrawListing(listingId: string, agencyId: string): Promise<{ ok: boolean; error?: string }> {
  const listings = await readListings()
  const target = listings.find((l) => l.id === listingId)
  if (!target) return { ok: false, error: 'Listing not found' }
  if (target.seller_agency_id !== agencyId) return { ok: false, error: 'Not your listing' }
  const next = listings.filter((l) => l.id !== listingId)
  const ok = await writeListings(next)
  return ok ? { ok: true } : { ok: false, error: 'Failed to withdraw' }
}

/**
 * Purchase a lead. Records the fee in the ledger and hands over the lead's
 * contact details (read from buyer_leads, service role). Demo mode: paid
 * instantly. When Stripe is configured, this is called after checkout.
 */
export async function purchaseLead(listingId: string, buyerAgencyId: string, buyerAgencyName?: string | null): Promise<{ ok: boolean; error?: string; lead?: Record<string, unknown> | null }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const listings = await readListings()
  const listing = listings.find((l) => l.id === listingId)
  if (!listing) return { ok: false, error: 'Listing not found' }
  if (listing.status !== 'listed') return { ok: false, error: 'This lead has already been sold' }
  if (listing.seller_agency_id === buyerAgencyId) return { ok: false, error: 'You cannot buy your own lead' }

  // Pull the lead's contact details.
  const { data: lead } = await svc.from('buyer_leads').select('*').eq('id', listing.lead_id).maybeSingle()

  // Mark sold.
  listing.status = 'sold'
  listing.buyer_agency_id = buyerAgencyId
  listing.buyer_agency_name = buyerAgencyName || null
  listing.purchased_at = new Date().toISOString()
  const listOk = await writeListings(listings)
  if (!listOk) return { ok: false, error: 'Failed to finalize purchase' }

  // Ledger entry (records the platform fee — Concord's cut of the sale).
  const ledger = await readLedger()
  ledger.push({
    id: uid(),
    listing_id: listingId,
    lead_id: listing.lead_id,
    seller_agency_id: listing.seller_agency_id,
    buyer_agency_id: buyerAgencyId,
    price_cents: listing.price_cents,
    platform_fee_cents: listing.platform_fee_cents || 0,
    status: 'paid',
    created_at: new Date().toISOString(),
  })
  await writeLedger(ledger)

  return { ok: true, lead: lead as Record<string, unknown> | null }
}
