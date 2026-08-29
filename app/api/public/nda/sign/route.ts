/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServerClient } from '@/lib/supabase/server'
import { generateNdaProfilePdf } from '@/lib/buyerFormPdf.server'
import { FF_BUCKET } from '@/lib/storageBuckets'
import { computeVisitorIntentScore, visitorRecencyWeight } from '@/lib/visitorIntent'
import {rateLimitAsync } from '@/lib/rateLimit'

// ---------------------------------------------------------------------------
// POST /api/public/nda/sign — accountless, per-listing NDA + Buyer Profile
// Form signature. Body: { listingId, name, email, guideAcknowledged,
// ndaFormData, buyerProfile }. Returns: { ok, token } — the token unlocks
// ONLY this listing's financials via GET /api/public/nda/financials. No
// login, no account, nothing else on the site is gated by this.
// ---------------------------------------------------------------------------

export const runtime = 'nodejs'

const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

export async function POST(req: NextRequest) {
  // Anti-abuse: public endpoint — rate limited per IP.
  if (!(await rateLimitAsync(clientIp(req), { limit: 10, windowMs: 60 * 1000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }
  const svc = createServerClient()
  if (!svc) return NextResponse.json({ ok: false, error: 'Not configured.' }, { status: 503 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }

  const listingId = String(body?.listingId || '')
  const name = String(body?.name || '').trim()
  const email = String(body?.email || '').trim()
  const visitorId = String(body?.visitorId || '').trim() || null
  const guideAcknowledged = body?.guideAcknowledged === true
  const ndaFormData = (body?.ndaFormData && typeof body.ndaFormData === 'object') ? body.ndaFormData : {}
  const buyerProfile = (body?.buyerProfile && typeof body.buyerProfile === 'object') ? body.buyerProfile : {}

  if (!listingId || !name || !email) {
    return NextResponse.json({ ok: false, error: 'Name, email, and listing are required.' }, { status: 400 })
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid email address.' }, { status: 400 })
  }
  if (!guideAcknowledged) {
    return NextResponse.json({ ok: false, error: 'Please confirm you have read the Buyer Forms Overview & Confidentiality Guide.' }, { status: 400 })
  }

  // Only a published listing can be NDA'd — the same gate the public feed uses.
  const { data: feed, error: listingErr } = await svc.rpc('get_public_listing_feed', { p_slug: listingId })
  const listingRow = Array.isArray(feed) ? feed[0] : null
  if (listingErr || !listingRow) {
    return NextResponse.json({ ok: false, error: 'Listing not found.' }, { status: 404 })
  }
  const listing = {
    id: listingRow.listing_id,
    business_name: listingRow.public_title || listingRow.business_name || null,
    industry: listingRow.industry,
    public_title: listingRow.public_title || null,
    location_general: listingRow.location_general || null,
    listing_ref: (listingRow as any)?.listing_ref || null,
  }

  const token = crypto.randomBytes(32).toString('hex')
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const userAgent = req.headers.get('user-agent') || null
  const signedAt = new Date().toISOString()

  // Generate the buyer's REAL Confidentiality Agreement + Buyer Profile Form
  // (his actual branded PDFs, filled in — not a re-typeset summary) for the
  // broker's records. Contains the buyer's home address, driver's
  // license/EIN, and net worth — goes in the private financial_docs bucket,
  // never the public one. pdf_url stores the storage PATH; the broker
  // dashboard resolves a signed URL on demand. Best-effort — a PDF failure
  // should never block the buyer's unlock.
  let pdfPath: string | null = null
  try {
    const bytes = await generateNdaProfilePdf({
      listingId,
      businessCategory: listing.industry,
      businessName: listing.public_title || listing.business_name || null,
      listingLocation: listing.location_general || null,
      listingRef: (listing as any)?.listing_ref || null,
      ndaFormData, buyerProfile, signerName: name, signedAt,
    })

    const path = `nda-forms/${listingId}/${Date.now()}-${email.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`
    const { error: upErr } = await svc.storage.from(FF_BUCKET).upload(path, Buffer.from(bytes), { contentType: 'application/pdf', upsert: false })
    if (!upErr) pdfPath = path
  } catch {
    /* non-fatal */
  }

  const { error: insErr } = await svc.from('listing_nda_signatures').insert({
    listing_id: listingId,
    buyer_name: name,
    buyer_email: email,
    unlock_token: token,
    ip_address: ip,
    user_agent: userAgent,
    nda_form_data: ndaFormData,
    buyer_profile: buyerProfile,
    guide_acknowledged: guideAcknowledged,
    pdf_url: pdfPath,
  })
  if (insErr) {
    return NextResponse.json({ ok: false, error: 'Could not record signature. Please try again.' }, { status: 500 })
  }

  // --- Funnel: NDA signer → CRM buyer lead (so brokers see who's signing). ---
  // Best-effort; a lead write failure never blocks the buyer's unlock.
  try {
    const profile = (buyerProfile || {}) as Record<string, unknown>
    const phone =
      String(profile.phone || profile.mobile || '').trim() ||
      String(ndaFormData.phone || ndaFormData.cell || '').trim() ||
      null
    const fundsRaw = String(profile.down_payment_amount || '').replace(/[$,]/g, '')
    const funds = fundsRaw ? Number(fundsRaw) || null : null
    const sba = String(profile.qualified_sba_loan || '').toLowerCase()
    const desired = String(profile.type_of_business_preferred || '').trim() || null
    const location = String(profile.location_preference || '').trim() || null

    // Upsert by email: enrich an existing lead, create a new one otherwise.
    const { data: existing } = await svc.from('buyer_leads').select('id').eq('email', email).maybeSingle()

    // Intent → lead score linkage: if the signer is an anonymous visitor we
    // tracked, fold their browsing intent (views, breadth, recency) into the
    // lead's record so brokers see how hot this buyer was before they signed.
    let intentNote = ''
    if (visitorId) {
      const { data: views } = await svc
        .from('listing_views')
        .select('listing_id, viewed_at')
        .eq('visitor_id', visitorId)
        .limit(5000)
      const viewRows = (views || []) as { listing_id: string; viewed_at: string }[]
      if (viewRows.length > 0) {
        const distinct = new Set(viewRows.map((v) => v.listing_id)).size
        const score = computeVisitorIntentScore(
          viewRows.map((v) => ({ viewedAtIso: v.viewed_at })),
          distinct,
        )
        intentNote = ` 👀 Intent ${score}/100 — ${viewRows.length} views across ${distinct} listing${distinct === 1 ? '' : 's'} before signing`
      }
    }

    const leadPayload: Record<string, unknown> = {
      full_name: name,
      email,
      phone,
      desired_business_type: desired || listing.industry || null,
      industry_interest: listing.industry || null,
      preferred_location: location,
      funds_available: funds,
      financing_method: sba === 'yes' ? 'SBA' : null,
      listing_id: listingId,
      source: 'nda_sign',
      notes: `Signed NDA for ${listing.business_name || 'a listing'} on ${signedAt.slice(0, 10)}` + intentNote,
      status: 'new',
    }
    if (existing) {
      await svc.from('buyer_leads').update(leadPayload).eq('id', existing.id)
    } else {
      const { data: listingAgency } = await svc.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
      await svc.from('buyer_leads').insert({ ...leadPayload, agency_id: listingAgency?.agency_id || null })
    }
  } catch {
    /* lead sync is best-effort */
  }

  return NextResponse.json({ ok: true, token })
}
