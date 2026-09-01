/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { FF_BUCKET, autoTagCategory, fileKindOf } from '@/lib/storageBuckets'
import { bandForIndustry } from '@/lib/marketMultiplesCore'

export const runtime = 'nodejs'

// =============================================================================
// /api/seller-portal — token-gated seller self-service portal.
//
//   GET    ?token=***            → lead status, listing, live stats, next steps,
//                                 + financials: seller-uploaded docs + live
//                                 recast preview (revenue/SDE/value range).
//   POST   (multipart)           → upload a financial document as the seller:
//                                 token, fiscalYear?, file. Lands in
//                                 financial_documents with upload_source='seller'
//                                 and feeds the universal reader.
//   DELETE ?token=***&docId=***  → remove a seller-uploaded document.
//
// Token IS the auth — same pattern as the lender portal, no login needed.
// Never returns buyer PII. Financial numbers are returned only as the
// seller's own aggregated preview (revenue, SDE, estimated range).
// =============================================================================

async function resolveListingByToken(db: ReturnType<typeof createServerClient>, token: string): Promise<{ lead: any; listingId: string | null } | null> {
  const { data: lead } = await db
    .from('seller_leads')
    .select('id, business_name, industry, location_general, status, source, created_at, converted_listing_id')
    .eq('portal_token', token)
    .maybeSingle()

  // A token may belong to a LISTING directly (seller-order path — free/paid
  // plans create a listing + order, no lead row). Never return null just
  // because there is no lead: check the listing token too.
  let listingId: string | null = null
  if (lead) {
    listingId = (lead as { converted_listing_id?: string | null }).converted_listing_id || null
  }
  if (!listingId) {
    const { data: byToken } = await db
      .from('listings')
      .select('id')
      .eq('portal_token', token)
      .maybeSingle()
    listingId = (byToken as { id?: string } | null)?.id || null
  }
  if (!lead && !listingId) return null
  return { lead: lead || null, listingId }
}

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const token = req.nextUrl.searchParams.get('token') || ''
  if (!token || token.length < 12) {
    return NextResponse.json({ ok: false, error: 'Invalid link' }, { status: 400 })
  }

  const resolved = await resolveListingByToken(db, token)
  if (!resolved) {
    return NextResponse.json({ ok: false, error: 'Link not found or expired' }, { status: 404 })
  }
  const { lead, listingId } = resolved

  // 2) Resolve the listing (converted lead link or token-carrying listing).
  let listing = null
  if (listingId) {
    const { data: l } = await db
      .from('listings')
      .select('id, agency_id, listing_ref, business_name, industry, location_general, asking_price, annual_revenue, sde, ebitda, status, published_at')
      .eq('id', listingId)
      .maybeSingle()
    if (l) {
      listing = {
        id: (l as { id: string }).id,
        agency_id: (l as { agency_id?: string | null }).agency_id || null,
        listing_ref: (l as { listing_ref?: string | null }).listing_ref || null,
        business_name: (l as { business_name?: string | null }).business_name || null,
        industry: (l as { industry?: string | null }).industry || null,
        location_general: (l as { location_general?: string | null }).location_general || null,
        asking_price: (l as { asking_price?: number | null }).asking_price ?? null,
        annual_revenue: (l as { annual_revenue?: number | null }).annual_revenue ?? null,
        sde: (l as { sde?: number | null }).sde ?? null,
        ebitda: (l as { ebitda?: number | null }).ebitda ?? null,
        status: (l as { status?: string | null }).status || null,
        published: Boolean((l as { published_at?: string | null }).published_at),
      }
    }
  }

  // 3) Live stats: listing views (7d + total) + NDA/data-room access requests.
  //    Audit fix 09-01: sellers got a bare count — now return the request list
  //    (name/company/status/date) so they can see "who asked & where it stands".
  let views7d = 0
  let viewsTotal = 0
  const ndaList: Array<{ id: string; requester_name: string; requester_company: string | null; status: string; nda_signed_at: string | null; created_at: string | null }> = []
  if (listingId) {
    const since = new Date(Date.now() - 7 * 86400000).toISOString()
    const [viewsRes, ndaRes] = await Promise.all([
      db.from('listing_views').select('id, viewed_at').eq('listing_id', listingId),
      db.from('data_room_access_requests').select('id, requester_name, requester_company, status, nda_signed_at, created_at').eq('listing_id', listingId).order('created_at', { ascending: false }).limit(50),
    ])
    const views = (viewsRes.data || []) as { viewed_at?: string }[]
    viewsTotal = views.length
    views7d = views.filter((v) => v.viewed_at && v.viewed_at >= since).length
    for (const r of ((ndaRes.data || []) as Array<{ id: string; requester_name?: string | null; requester_company?: string | null; status?: string | null; nda_signed_at?: string | null; created_at?: string | null }>)) {
      ndaList.push({
        id: r.id,
        requester_name: r.requester_name || 'Confidential buyer',
        requester_company: r.requester_company || null,
        status: r.status || 'pending',
        nda_signed_at: r.nda_signed_at || null,
        created_at: r.created_at || null,
      })
    }
  }
  const ndaRequests = ndaList.length

  // 4) Financials: seller-uploaded docs + live recast preview (Phase 3).
  const financials: {
    docs: { id: string; file_name: string; file_url: string; fiscal_year: number | null; category: string; upload_source: string; status: string }[]
    preview: { revenue: number | null; sde: number | null; ebitda: number | null; valueRangeLow: number | null; valueRangeHigh: number | null } | null
  } = { docs: [], preview: null }

  if (listingId) {
    const { data: docs } = await db
      .from('financial_documents')
      .select('id, file_name, file_url, storage_path, fiscal_year, category, upload_source, status')
      .eq('listing_id', listingId)
      .order('uploaded_at', { ascending: false })
      .limit(50)
    // SECURITY: private bucket — serve short-lived signed URLs, never public paths.
    financials.docs = await Promise.all((((docs || []) as any[])).map(async (d) => {
      let fileUrl = d.file_url as string | null
      if (d.storage_path) {
        // Source financials live in the PRIVATE financial_docs bucket — sign
        // from THAT bucket (signing from 'documents' would 404 the object).
        const { data: su } = await db.storage.from(FF_BUCKET).createSignedUrl(d.storage_path, 3600)
        if (su?.signedUrl) fileUrl = su.signedUrl
      }
      return {
        id: d.id,
        file_name: d.file_name,
        file_url: fileUrl,
        fiscal_year: d.fiscal_year ?? null,
        category: d.category || 'other',
        upload_source: d.upload_source || 'broker',
        status: d.status || 'pending',
      }
    }))

    // Live recast preview: approved/overridden extraction wins, else listing figures.
    const { data: extractions } = await db
      .from('financial_extractions')
      .select('fiscal_year, extracted, broker_override, review_state')
      .eq('listing_id', listingId)
      .in('review_state', ['approved', 'overridden'])
    const exRows = (extractions || []) as Array<{
      fiscal_year: number | null
      extracted: Record<string, unknown> | null
      broker_override: Record<string, unknown> | null
      review_state: string
    }>
    let revenue: number | null = null
    let sde: number | null = null
    let ebitda: number | null = null
    for (const ex of exRows) {
      const d = ex.review_state === 'overridden' && ex.broker_override ? ex.broker_override : ex.extracted || {}
      if (revenue == null && Number(d.revenueTotal)) revenue = Number(d.revenueTotal)
      if (sde == null && Number(d.sde)) sde = Number(d.sde)
      if (ebitda == null && Number(d.ebitda)) ebitda = Number(d.ebitda)
    }
    if (revenue == null && listing?.annual_revenue != null) revenue = listing.annual_revenue
    if (sde == null && listing?.sde != null) sde = listing.sde
    if (ebitda == null && listing?.ebitda != null) ebitda = listing.ebitda

    let valueRangeLow: number | null = null
    let valueRangeHigh: number | null = null
    if (sde != null) {
      const band = bandForIndustry((listing as { industry?: string | null } | null)?.industry || null, 'SDE')
      valueRangeLow = Math.round(sde * band.min)
      valueRangeHigh = Math.round(sde * band.max)
    }
    if (revenue != null || sde != null || ebitda != null || valueRangeLow != null) {
      financials.preview = { revenue, sde, ebitda, valueRangeLow, valueRangeHigh }
    }
  }

  // 5) Next steps — human-readable, stage-aware.
  const nextSteps: string[] = []
  if (!listing) {
    nextSteps.push('Your valuation request is being reviewed by a broker.')
    nextSteps.push('A broker will contact you within one business day to confirm details.')
    nextSteps.push('Once approved, your listing will be prepared confidentially.')
  } else if (!listing.published) {
    nextSteps.push('Your listing is being prepared — financials, valuation, and marketing documents.')
    nextSteps.push('You will be asked to approve the public preview before anything goes live.')
  } else {
    nextSteps.push('Your listing is live on the marketplace (confidential to qualified buyers).')
    if (viewsTotal > 0) nextSteps.push(`${viewsTotal} buyer view${viewsTotal === 1 ? '' : 's'} so far${views7d > 0 ? `, ${views7d} this week` : ''}.`)
    if (ndaRequests > 0) nextSteps.push(`${ndaRequests} buyer${ndaRequests === 1 ? '' : 's'} requested confidential access.`)
    nextSteps.push('Your broker will bring you qualified offers as they come in.')
  }

  return NextResponse.json({
    ok: true,
    // SELLER-ORDER PATH: the token belongs to a LISTING, not a seller_leads
    // row (free/paid plans create a listing + order, no lead). The portal UI
    // renders off `lead` — synthesize a lead-equivalent from the listing so
    // the seller sees their business name + status instead of "Link not
    // found" (caught by the listing-flow sweep e2e).
    lead: lead
      ? {
          id: (lead as { id: string }).id,
          business_name: (lead as { business_name?: string | null }).business_name || null,
          industry: (lead as { industry?: string | null }).industry || null,
          location_general: (lead as { location_general?: string | null }).location_general || null,
          status: (lead as { status?: string | null }).status || null,
          source: (lead as { source?: string | null }).source || null,
          created_at: (lead as { created_at?: string | null }).created_at || null,
        }
      : listing
        ? {
            id: null,
            business_name: listing.business_name,
            industry: listing.industry,
            location_general: listing.location_general,
            status: listing.status,
            source: 'seller_self_service',
            created_at: null,
          }
        : null,
    listing,
    stats: { views7d, viewsTotal, ndaRequests },
    ndaList,
    financials,
    nextSteps,
  })
}

// ---------------------------------------------------------------------------
// POST — seller self-upload of a financial document (token-gated).
// ---------------------------------------------------------------------------
const MAX_UPLOAD = 25 * 1024 * 1024 // 25 MB

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ ok: false, error: 'Invalid upload' }, { status: 400 })

  const token = String(form.get('token') || '')
  if (!token || token.length < 12) {
    return NextResponse.json({ ok: false, error: 'Invalid link' }, { status: 400 })
  }
  const resolved = await resolveListingByToken(db, token)
  if (!resolved) {
    return NextResponse.json({ ok: false, error: 'Link not found or expired' }, { status: 404 })
  }
  const { listingId } = resolved
  if (!listingId) {
    return NextResponse.json({ ok: false, error: 'Your listing is still being set up — check back soon.' }, { status: 409 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'Missing file' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD) {
    return NextResponse.json({ ok: false, error: 'File is over 25MB' }, { status: 400 })
  }

  const fiscalYearRaw = String(form.get('fiscalYear') || '')
  const fiscalYear = fiscalYearRaw ? Math.min(Math.max(parseInt(fiscalYearRaw, 10) || 1, 1), 5) : null

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `financial-files/${listingId}/seller-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`

  const { error: upErr } = await db.storage
    .from(FF_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined })
  if (upErr) return NextResponse.json({ ok: false, error: `Upload failed: ${upErr.message}` }, { status: 500 })

  const { data: urlData } = db.storage.from(FF_BUCKET).getPublicUrl(path)
  const { data: doc, error: insErr } = await db.from('financial_documents').insert({
    listing_id: listingId,
    file_name: file.name,
    file_url: urlData?.publicUrl || '',
    storage_path: path,
    file_size: file.size,
    mime_type: file.type || null,
    file_kind: fileKindOf(file.name),
    category: autoTagCategory(file.name),
    status: 'pending',
    fiscal_year: fiscalYear,
    upload_source: 'seller',
  }).select('id, file_name, file_url, fiscal_year, category, upload_source, status').single()
  if (insErr || !doc) {
    await db.storage.from(FF_BUCKET).remove([path]).catch(() => {})
    return NextResponse.json({ ok: false, error: insErr?.message || 'Could not save document' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, doc })
}

// ---------------------------------------------------------------------------
// DELETE — remove a seller-uploaded document (token-gated, doc must belong
// to the seller's listing AND be seller-uploaded).
// ---------------------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const token = req.nextUrl.searchParams.get('token') || ''
  const docId = req.nextUrl.searchParams.get('docId') || ''
  if (!token || token.length < 12 || !docId) {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 })
  }
  const resolved = await resolveListingByToken(db, token)
  if (!resolved) {
    return NextResponse.json({ ok: false, error: 'Link not found or expired' }, { status: 404 })
  }
  const { listingId } = resolved

  const { data: doc } = await db
    .from('financial_documents')
    .select('id, listing_id, storage_path, upload_source')
    .eq('id', docId)
    .maybeSingle()
  if (!doc || (doc as { listing_id?: string | null }).listing_id !== listingId || (doc as { upload_source?: string }).upload_source !== 'seller') {
    return NextResponse.json({ ok: false, error: 'Document not found or not removable' }, { status: 404 })
  }

  const storagePath = (doc as { storage_path?: string | null }).storage_path
  if (storagePath) {
    await db.storage.from(FF_BUCKET).remove([storagePath]).catch(() => {})
  }
  const { error: delErr } = await db.from('financial_documents').delete().eq('id', docId)
  if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 })
  // Cascade removes the extraction row too (FK on delete cascade).

  return NextResponse.json({ ok: true })
}
