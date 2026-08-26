/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'

export const runtime = 'nodejs'

// =============================================================================
// GET /api/admin/search?q= — global lookup across users, listings, agencies,
// seller leads, buyer leads, and deals (matched via their listing's name).
// Super admin only. Returns grouped results, max 15 per type.
// =============================================================================

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ ok: true, query: q, users: [], listings: [], agencies: [], sellerLeads: [], buyerLeads: [], deals: [] })

  const like = `%${q}%`
  const [users, listings, agencies, sellerLeads, buyerLeads, deals, listingNames] = await Promise.all([
    db.from('profiles').select('id, email, full_name, role, status, created_at').or(`email.ilike.${like},full_name.ilike.${like}`).limit(15),
    db.from('listings').select('id, business_name, status, review_stage, asking_price, agency_id, created_at').ilike('business_name', like).limit(15),
    db.from('agencies').select('id, name, slug, plan_type, is_active, created_at').or(`name.ilike.${like},slug.ilike.${like}`).limit(15),
    db.from('seller_leads').select('id, business_name, contact_name, contact_email, phone, status, agency_id, created_at').or(`business_name.ilike.${like},contact_name.ilike.${like},contact_email.ilike.${like}`).limit(10),
    db.from('buyer_leads').select('id, full_name, company, email, phone, status, agency_id, created_at').or(`full_name.ilike.${like},company.ilike.${like},email.ilike.${like}`).limit(10),
    db.from('deals').select('id, listing_id, status, purchase_price, agency_id, created_at').order('created_at', { ascending: false }).limit(300),
    db.from('listings').select('id, business_name'),
  ])

  const nameByListing = new Map((listingNames.data || []).map((l: any) => [l.id, l.business_name]))
  const dealsMatch = (deals.data || [])
    .filter((d: any) => (nameByListing.get(d.listing_id) || '').toLowerCase().includes(q.toLowerCase()))
    .slice(0, 15)
    .map((d: any) => ({ ...d, business_name: nameByListing.get(d.listing_id) || '—' }))

  return NextResponse.json({
    ok: true,
    query: q,
    users: users.data || [],
    listings: listings.data || [],
    agencies: agencies.data || [],
    sellerLeads: sellerLeads.data || [],
    buyerLeads: buyerLeads.data || [],
    deals: dealsMatch,
  })
}
