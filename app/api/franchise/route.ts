/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DOCS_BUCKET } from '@/lib/storageBuckets'
import { FRANCHISE_PLAN_ID, FRANCHISE_PLAN_NAME, FRANCHISE_PRICE, type FranchiseDetailsInput } from '@/lib/franchise'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { createServerClient } from '@/lib/supabase/server'
import { rateLimitAsync } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  : null

const MAX_ITEM19_BYTES = 12 * 1024 * 1024 // 12 MB — matches financial-import

const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

// Default agency for public self-serve franchise intake. NEVER trusted from
// the client body (S1 fix — cross-tenant write vector): unauthenticated
// callers always land here; authenticated agency admins/owners may scope to
// their own agency only.
const DEFAULT_AGENCY_ID = process.env.VOICE_AGENT_AGENCY_ID || '354facdb-cce2-4eb0-a160-8454854e731a'

/**
 * POST /api/franchise (multipart/form-data)
 * Creates a franchise listing (is_franchise=true, status=draft) + its
 * franchise_details row, with an optional Item 19 PDF (stored in the private
 * documents bucket; never publicly downloadable — NDA-gated at view time).
 *
 * Fields: brand_name (required), industry_category, total_investment_min,
 * total_investment_max, franchise_fee, royalty_fee_pct, territories_available,
 * existing_units, training_support, ideal_candidate_liquid_capital,
 * ideal_candidate_net_worth, agency_id (authenticated owners/admins only),
 * email, + optional item19 file.
 *
 * Returns { ok, listingId, franchise: FranchiseDetails }. The caller then opens
 * Stripe checkout (product=franchise_listing) — payment auto-publishes.
 */
export async function POST(req: NextRequest) {
  if (!svc) return NextResponse.json({ ok: false, error: 'Database is not configured' }, { status: 503 })

  // Anti-abuse: public write endpoint — rate limited per IP (the audit test
  // only walks app/api/public, so this was uncovered; fixed here).
  if (!(await rateLimitAsync(clientIp(req), { limit: 10, windowMs: 60 * 1000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected multipart/form-data.' }, { status: 400 })
  }

  const str = (k: string) => {
    const v = form.get(k)
    return typeof v === 'string' ? v.trim() : ''
  }
  const num = (k: string): number | null => {
    const v = str(k)
    if (!v) return null
    const n = Number(v.replace(/[$,%]/g, ''))
    return Number.isFinite(n) ? n : null
  }

  const brandName = str('brand_name')
  if (!brandName) return NextResponse.json({ ok: false, error: 'Brand name is required' }, { status: 400 })

  // S1 fix: agency scoping. The client-supplied agency_id is IGNORED for
  // unauthenticated callers — listings land in the platform default agency.
  // Authenticated agency members (owner/admin) may scope to their own agency.
  let agencyId = DEFAULT_AGENCY_ID
  const auth = await authenticateProfileRequest(req)
  if (auth) {
    const requestedAgency = str('agency_id')
    if (requestedAgency && canManageAgency(auth, requestedAgency)) agencyId = requestedAgency
    else if (auth.memberships?.length) {
      const mine = auth.memberships.find((m) => m.is_owner || m.role === 'admin')
      if (mine) agencyId = mine.agency_id
    }
  }

  const details: FranchiseDetailsInput = {
    brand_name: brandName.slice(0, 200),
    industry_category: str('industry_category').slice(0, 120) || null,
    total_investment_min: num('total_investment_min'),
    total_investment_max: num('total_investment_max'),
    franchise_fee: num('franchise_fee'),
    royalty_fee_pct: num('royalty_fee_pct'),
    territories_available: str('territories_available').slice(0, 1000) || null,
    existing_units: num('existing_units'),
    training_support: str('training_support').slice(0, 2000) || null,
    ideal_candidate_liquid_capital: num('ideal_candidate_liquid_capital'),
    ideal_candidate_net_worth: num('ideal_candidate_net_worth'),
  }

  // 1) Create the franchise listing (draft; webhook publishes on payment).
  const { data: listing, error: listingError } = await svc
    .from('listings')
    .insert({
      agency_id: agencyId,
      business_name: brandName.slice(0, 200),
      headline: `${brandName.slice(0, 100)} — Franchise Opportunity`,
      industry: str('industry_category').slice(0, 100) || 'Franchise',
      is_franchise: true,
      status: 'draft',
      confidentiality_level: 'anonymous',
      intake_source: 'franchise_self_service',
      compliance_status: 'pending',
      ai_readiness_score: 0,
    })
    .select()
    .single()
  if (listingError) return NextResponse.json({ ok: false, error: listingError.message || 'Failed to create listing' }, { status: 500 })

  // 2) Optional Item 19 PDF → private documents bucket + listing_documents row.
  const item19 = form.get('item19')
  if (item19 instanceof File && item19.size > 0) {
    if (item19.size > MAX_ITEM19_BYTES) {
      await svc.from('listings').delete().eq('id', listing.id)
      return NextResponse.json({ ok: false, error: 'Item 19 file is over 12 MB.' }, { status: 413 })
    }
    const fileName = item19.name || 'item19.pdf'
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const stamp = Date.now()
    const storagePath = `franchise-item19/${listing.id}/${stamp}-${safeName}`
    const bytes = Buffer.from(await item19.arrayBuffer())
    const { error: upErr } = await svc.storage.from(DOCS_BUCKET).upload(storagePath, bytes, {
      cacheControl: '3600', upsert: false, contentType: item19.type || 'application/pdf',
    })
    if (!upErr) {
      const { data: doc, error: docErr } = await svc
        .from('listing_documents')
        .insert({
          listing_id: listing.id,
          category: 'franchise_item19',
          party_type: 'franchisor',
          file_name: fileName,
          file_url: null,
          storage_path: storagePath,
          document_type: 'item19',
          status: 'pending',
        })
        .select()
        .single()
      if (!docErr && doc) details.item19_document_id = doc.id
    }
  }

  // 3) Franchise details row.
  const { data: franchise, error: franchiseError } = await svc
    .from('franchise_details')
    .insert({ ...details, listing_id: listing.id })
    .select()
    .single()
  if (franchiseError) {
    await svc.from('listings').delete().eq('id', listing.id)
    return NextResponse.json({ ok: false, error: franchiseError.message || 'Failed to save franchise details' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, listingId: listing.id, franchise, plan: { id: FRANCHISE_PLAN_ID, name: FRANCHISE_PLAN_NAME, price: FRANCHISE_PRICE } })
}

/**
 * GET /api/franchise?listingId=…
 * Returns franchise details + subscription status for a listing. AGENCY-GATED
 * dashboard view (S2 fix): the caller must be an owner/admin of the listing's
 * agency. Public visitors use /api/public/franchise instead.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'Database is not configured' }, { status: 503 })

  const listingId = req.nextUrl.searchParams.get('listingId') || ''
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId is required' }, { status: 400 })

  // Auth required — this endpoint exposes billing/subscription data.
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const { data: listing } = await db.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!canManageAgency(auth, listing.agency_id)) return forbiddenResponse()

  const { data: details } = await db.from('franchise_details').select('*').eq('listing_id', listingId).maybeSingle()
  const { data: sub } = await db.from('franchise_subscriptions').select('*').eq('listing_id', listingId).maybeSingle()
  return NextResponse.json({ ok: true, franchise: details || null, subscription: sub || null })
}
