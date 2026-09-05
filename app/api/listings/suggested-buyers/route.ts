/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authenticateProfileRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

// =============================================================================
// /api/listings/suggested-buyers
// -----------------------------------------------------------------------------
// GET  ?listingId=… → agency-scoped buyer-lead suggestions for ANY listing
//      (works for listings created by agents in the same agency). Matches on
//      desired_business_type AND industry_interest (BizBuySell imports write
//      the ask there), plus location / funds-fit bonuses.
// POST { listingId, leadId, attach: true|false } → link or unlink a buyer
//      lead to a listing (buyer_leads.listing_id) with an activity note.
// =============================================================================

const SVC = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || 'NO_KEY', {
      auth: { persistSession: false },
    })
  : null

// Token synonym groups — keeps short industry labels matching ("car wash"
// vs "Car Wash & Detailing", "HVAC" vs "Heating & Cooling", etc.)
const SYNONYMS: Record<string, string[]> = {
  'car wash': ['car wash', 'carwash', 'detailing', 'detail', 'wash'],
  'lawn care': ['lawn', 'landscap', 'green', 'snow', 'ground', 'tree'],
  cleaning: ['clean', 'janitor', 'maid', 'sanitation', 'sanit'],
  logistics: ['logist', 'deliver', 'courier', 'truck', 'freight', 'transport', 'shipping'],
  hvac: ['hvac', 'heating', 'cooling', 'mechanical', 'plumb', 'electric', 'air conditioning', 'ac service'],
  nemt: ['nemt', 'medical transport', 'non-emergency', 'patient transport', 'ambulatory'],
  'gas station': ['gas station', 'gas', 'fuel', 'convenience', 'petrol', 'service station'],
  restaurant: ['restaurant', 'food', 'cafe', 'bar', 'diner', 'catering', 'fast food'],
  retail: ['retail', 'store', 'shop', 'boutique', 'convenience'],
  manufacturing: ['manufacturing', 'factory', 'production', 'plant', 'machine'],
  'home health': ['home health', 'homecare', 'home care', 'healthcare', 'nursing', 'care'],
  automotive: ['automotive', 'auto repair', 'mechanic', 'car repair', 'tire'],
  construction: ['construction', 'contractor', 'remodel', 'roofing', 'paint'],
}

function tokens(text: string | null | undefined): Set<string> {
  const out = new Set<string>()
  const raw = (text || '').toLowerCase()
  for (const [key, syns] of Object.entries(SYNONYMS)) {
    if (syns.some((s) => raw.includes(s)) || raw.includes(key)) {
      syns.forEach((s) => out.add(s))
      out.add(key)
    }
  }
  raw.split(/[^a-z0-9]+/).filter(Boolean).forEach((w) => {
    if (w.length > 2) out.add(w)
  })
  return out
}

function interestStrings(lead: Record<string, unknown>): string {
  const parts: string[] = []
  if (typeof lead.desired_business_type === 'string') parts.push(lead.desired_business_type)
  if (typeof lead.industry_interest === 'string') parts.push(lead.industry_interest)
  if (Array.isArray(lead.industries_interest)) {
    lead.industries_interest.filter((x): x is string => typeof x === 'string').forEach((x) => parts.push(x))
  } else if (typeof lead.industries_interest === 'string') {
    parts.push(lead.industries_interest)
  }
  return parts.filter(Boolean).join(', ')
}

export async function GET(req: NextRequest) {
  if (!SVC) return NextResponse.json({ ok: false, error: 'server not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const listingId = req.nextUrl.searchParams.get('listingId')
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId required' }, { status: 400 })

  const { data: listing } = await SVC.from('listings')
    .select('id, agency_id, industry, sub_industry, location_general, asking_price, sde, status')
    .eq('id', listingId)
    .maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'listing not found' }, { status: 404 })

  // Agency-scoped: only members of the listing's agency may see its buyers.
  const member = auth.memberships.find((m) => m.agency_id === listing.agency_id)
  if (!member) return forbiddenResponse('Not a member of this listing\'s agency')

  const { data: leads } = await SVC.from('buyer_leads')
    .select('*')
    .eq('agency_id', listing.agency_id)
    .order('created_at', { ascending: false })

  const listingTokens = tokens([listing.industry, listing.sub_industry].filter(Boolean).join(' '))
  const listingLoc = (listing.location_general || '').toLowerCase()
  const asking = listing.asking_price

  const matches = (leads || [])
    .map((lead) => {
      const haystack = interestStrings(lead)
      const lt = tokens(haystack)
      let shared = 0
      for (const t of lt) if (listingTokens.has(t)) shared += 1
      const reasons: string[] = []
      if (shared > 0) reasons.push(`Interested in ${haystack.split(',')[0]?.trim() || 'this type of business'}`)

      // Location bonus (preferred_location vs listing location)
      const prefLoc = (lead.preferred_location || '').toLowerCase()
      if (listingLoc && prefLoc) {
        const locTokens = prefLoc.split(/[^a-z0-9]+/).filter(Boolean)
        if (locTokens.some((p) => listingLoc.includes(p)) || listingLoc.split(/[^a-z0-9]+/).some((p) => prefLoc.includes(p))) {
          shared += 2
          reasons.push(`Prefers ${lead.preferred_location}`)
        }
      }
      // Funds-fit bonus
      const funds = lead.funds_available ?? (lead.budget_range ? Number(String(lead.budget_range).replace(/[^0-9]/g, '')) : null)
      if (asking && funds) {
        if (funds >= asking) {
          shared += 1
          reasons.push(`Funds cover asking ($${Number(funds).toLocaleString()})`)
        } else {
          shared -= 1
        }
      }
      const score = Math.max(0, Math.min(100, Math.round((shared / Math.max(1, listingTokens.size)) * 100 + shared * 4)))
      return { lead, score, reasons: shared > 0 ? reasons : [], matched: shared > 0 }
    })
    .sort((a, b) => b.score - a.score)

  return NextResponse.json({
    ok: true,
    listing: { id: listing.id, industry: listing.industry, location: listing.location_general },
    matches: matches.slice(0, 25).map(({ lead, score, reasons, matched }) => ({
      id: lead.id,
      name: lead.full_name || lead.contact_name || lead.email || 'Buyer',
      email: lead.email,
      phone: lead.phone,
      status: lead.status || 'new',
      source: lead.source || null,
      interests: interestStrings(lead),
      preferred_location: lead.preferred_location,
      funds_available: lead.funds_available ?? null,
      listing_id: lead.listing_id || null,
      attached_to_this: lead.listing_id === listing.id,
      score,
      matched,
      reasons,
    })),
  })
}

export async function POST(req: NextRequest) {
  if (!SVC) return NextResponse.json({ ok: false, error: 'server not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const { listingId, leadId, attach } = await req.json().catch(() => ({}))
  if (!listingId || !leadId || typeof attach !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'listingId, leadId and attach are required' }, { status: 400 })
  }

  const { data: listing } = await SVC.from('listings').select('id, agency_id').eq('id', listingId).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'listing not found' }, { status: 404 })
  const member = auth.memberships.find((m) => m.agency_id === listing.agency_id)
  if (!member) return forbiddenResponse('Not a member of this listing\'s agency')

  const { data: lead } = await SVC.from('buyer_leads').select('id, agency_id').eq('id', leadId).maybeSingle()
  if (!lead) return NextResponse.json({ ok: false, error: 'lead not found' }, { status: 404 })
  if (lead.agency_id && lead.agency_id !== listing.agency_id) {
    return forbiddenResponse('Lead belongs to another agency')
  }

  const { error } = await SVC.from('buyer_leads')
    .update({ listing_id: attach ? listingId : null })
    .eq('id', leadId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Activity note (best-effort)
  await SVC.from('lead_activities')
    .insert({
      lead_id: leadId,
      type: 'listing',
      description: attach
        ? `Linked to listing ${listingId.slice(0, 8)} (suggested-buyer match)`
        : `Unlinked from listing ${listingId.slice(0, 8)}`,
    })
    .then(() => undefined)

  return NextResponse.json({ ok: true, attached: attach })
}
