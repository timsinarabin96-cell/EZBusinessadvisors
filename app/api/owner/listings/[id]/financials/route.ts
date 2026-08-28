/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { assessLegitimacy, type LegitimacyReport } from '@/lib/listingLegitimacy'
import { assessListingRisk } from '@/lib/scamDetectionCore'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/owner/listings/[id]/financials — the 3-year financial proof.
// FormData fields:
//   established_year  (number)  — year the business was founded
//   revenue_year_1    (number)  — revenue 3 fiscal years ago
//   revenue_year_2    (number)  — revenue 2 fiscal years ago
//   revenue_year_3    (number)  — revenue last full fiscal year
//   files[]           (file)    — 1+ documents (P&L / tax returns), required
//
// Uploads docs to the financial_docs vault, records the numbers, then runs the
// AI legitimacy gate. Returns the verdict so the owner UI can show
// auto-approved / broker review / rejected instantly.
// =============================================================================

const BUCKET = 'financial_docs'
const DOC_PREFIX = 'legitimacy'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const svc = createServerClient()
  if (!svc) return NextResponse.json({ ok: false, error: 'Not configured.' }, { status: 503 })

  const { data: { user } } = await svc.auth.getUser()
  if (!user?.email) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 })

  const { data: listing } = await svc.from('listings').select('id, owner_email, business_name, established_year, revenue_year_1, revenue_year_2, revenue_year_3, financials_status').eq('id', id).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })

  const ownsListing =
    listing.owner_email === user.email ||
    (await svc.from('seller_listing_orders').select('id').eq('listing_id', id).eq('seller_email', user.email).maybeSingle().then((r) => Boolean(r.data)))
  if (!ownsListing) return NextResponse.json({ ok: false, error: 'You do not own this listing' }, { status: 403 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ ok: false, error: 'Expected multipart form data' }, { status: 400 })

  const num = (v: FormDataEntryValue | null): number | null => {
    if (v == null) return null
    const n = Number(String(v).replace(/[^0-9.]/g, ''))
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const establishedYear = num(form.get('established_year'))
  const revenueYear1 = num(form.get('revenue_year_1'))
  const revenueYear2 = num(form.get('revenue_year_2'))
  const revenueYear3 = num(form.get('revenue_year_3'))

  if (!establishedYear || !revenueYear1 || !revenueYear2 || !revenueYear3) {
    return NextResponse.json({ ok: false, error: 'Business established year + 3 years of revenue are all required.' }, { status: 400 })
  }
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: 'Upload at least one financial document (P&L or tax return) as proof.' }, { status: 400 })
  }

  // 1) Upload proof documents to the vault.
  const paths: string[] = []
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
    const path = `${DOC_PREFIX}/${id}/${Date.now()}-${safeName}`
    const bytes = new Uint8Array(await file.arrayBuffer())
    const { error: upErr } = await svc.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type || 'application/octet-stream',
      cacheControl: '3600',
      upsert: true,
    })
    if (upErr) return NextResponse.json({ ok: false, error: `Upload failed: ${upErr.message}` }, { status: 500 })
    paths.push(path)
  }

  // 2) Record the numbers + docs, link the owner email.
  const { error: upErr2 } = await svc
    .from('listings')
    .update({
      established_year: establishedYear,
      revenue_year_1: revenueYear1,
      revenue_year_2: revenueYear2,
      revenue_year_3: revenueYear3,
      financials_status: 'submitted',
      financials_doc_paths: paths,
      financials_submitted_at: new Date().toISOString(),
      owner_email: listing.owner_email || user.email,
    })
    .eq('id', id)
  if (upErr2) return NextResponse.json({ ok: false, error: upErr2.message }, { status: 500 })

  // 3) Run the AI legitimacy gate with the fresh data.
  const fresh = { ...listing, established_year: establishedYear, revenue_year_1: revenueYear1, revenue_year_2: revenueYear2, revenue_year_3: revenueYear3, financials_status: 'submitted' as const }
  let legitimacy: LegitimacyReport
  try {
    const risk = assessListingRisk({
      businessName: fresh.business_name,
      headline: fresh.business_name,
      description: null,
      industry: null,
      askingPrice: null,
      annualRevenue: revenueYear3,
      sde: null,
      imageCount: 0,
      listingCreatedAt: null,
      publishedAt: null,
      ownerCreatedAt: null,
    })
    legitimacy = assessLegitimacy({
      establishedYear,
      revenueYear1,
      revenueYear2,
      revenueYear3,
      scamScore: risk.score,
      financialsStatus: 'submitted',
    })
  } catch {
    legitimacy = assessLegitimacy({ establishedYear, revenueYear1, revenueYear2, revenueYear3, scamScore: 0, financialsStatus: 'submitted' })
  }
  try {
    await svc
      .from('listings')
      .update({ legitimacy_score: legitimacy.score, legitimacy_verdict: legitimacy.verdict, ai_reviewed_at: new Date().toISOString() })
      .eq('id', id)
  } catch {
    // best-effort verdict persistence — the upload itself already succeeded
  }

  const labels: Record<string, string> = {
    auto_approved: '✅ AI-approved — your listing can go live',
    broker_review: '👨‍💼 Queued for broker review',
    pending: '⏳ Financials recorded — still missing requirements',
    rejected: '❌ Rejected — see reasons',
  }
  return NextResponse.json({
    ok: true,
    verdict: legitimacy.verdict,
    score: legitimacy.score,
    reasons: legitimacy.reasons,
    message: labels[legitimacy.verdict] || 'Financials recorded',
  })
}
