// =============================================================================
// Caller ID Intelligence — reverse phone lookup for inbound calls.
// -----------------------------------------------------------------------------
// Matches a caller's phone number against buyer leads, seller leads, and
// profiles so the call log shows WHO is calling and WHAT they're calling
// about, even though Twilio only ever sends a number. Server-only.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

/** Normalize a phone number to comparable digits (E.164-ish). */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
}

export interface CallerIdentity {
  matched: boolean
  kind: 'buyer' | 'seller' | 'profile' | null
  name: string | null
  phone: string | null
  sourceId: string | null
  listingId: string | null
  listingName: string | null
  listingRef: string | null
  extra: Record<string, unknown>
}

/** Reverse-match a phone number against the CRM. Never throws. */
export async function matchCaller(agencyId: string, phone: string | null | undefined): Promise<CallerIdentity> {
  const empty: CallerIdentity = { matched: false, kind: null, name: null, phone: null, sourceId: null, listingId: null, listingName: null, listingRef: null, extra: {} }
  if (!svc || !agencyId) return empty

  const norm = normalizePhone(phone)
  if (norm.length < 7) return empty

  // Try exact normalized match on buyer_leads first (most common caller).
  const { data: buyers } = await svc
    .from('buyer_leads')
    .select('id, full_name, phone, listing_id, desired_business_type, verified_buyer')
    .eq('agency_id', agencyId)
    .limit(10)
  const buyer = (buyers || []).find((b: any) => normalizePhone(b.phone) === norm)
  if (buyer) {
    let listingId: string | null = buyer.listing_id || null
    let listingName: string | null = null
    let listingRef: string | null = null
    if (listingId) {
      const { data: listing } = await svc.from('listings').select('business_name, listing_ref').eq('id', listingId).maybeSingle()
      listingName = listing?.business_name || null
      listingRef = listing?.listing_ref || null
    }
    return {
      matched: true,
      kind: 'buyer',
      name: buyer.full_name || null,
      phone: buyer.phone || null,
      sourceId: buyer.id,
      listingId,
      listingName,
      listingRef,
      extra: { desired_business_type: buyer.desired_business_type, verified_buyer: buyer.verified_buyer },
    }
  }

  // Then seller leads.
  const { data: sellers } = await svc
    .from('seller_leads')
    .select('id, full_name, phone, business_name')
    .eq('agency_id', agencyId)
    .limit(10)
  const seller = (sellers || []).find((s: any) => normalizePhone(s.phone) === norm)
  if (seller) {
    return {
      matched: true,
      kind: 'seller',
      name: seller.full_name || seller.business_name || null,
      phone: seller.phone || null,
      sourceId: seller.id,
      listingId: null,
      listingName: seller.business_name || null,
      listingRef: null,
      extra: {},
    }
  }

  return empty
}
