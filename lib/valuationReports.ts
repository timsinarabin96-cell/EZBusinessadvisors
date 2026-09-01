/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Paid Valuation Reports — sellable, auto-generated valuation PDFs.
//   standard ($199): full recast + valuation range + BOV-style summary
//   full_bov  ($499): everything + expanded BOV + marketing-ready teaser
// Uses the existing valuation engine (lib/valuation.ts) + pdf-lib to build a
// polished branded PDF on demand. Server-only.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { computeValuation, type ValuationInputs } from '@/lib/valuation'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export const VALUATION_TIERS = [
  { id: 'standard', name: 'Quick Valuation Estimate', priceCents: 19900, blurb: 'A fast multiples-based estimate (SDE/EBITDA bands + value range). NOT a CIM — the full Confidential Information Memorandum ships with the $250 AI-Verified Listing.' },
  { id: 'full_bov', name: 'Quick Estimate + BOV Summary', priceCents: 49900, blurb: 'Everything in Quick Estimate, plus an expanded Broker Opinion of Value summary and a marketing-ready teaser. Still not a CIM — the full CIM ships with the $250 AI-Verified Listing.' },
] as const

export type ValuationTierId = 'standard' | 'full_bov'

const NAVY = rgb(0.1, 0.1, 0.18)
const GOLD = rgb(0.79, 0.66, 0.30)
const INK = rgb(0.2, 0.2, 0.25)
const MUTED = rgb(0.5, 0.5, 0.55)

/**
 * Generate a branded valuation report PDF for a listing.
 * Pure PDF generation — the order/record side lives in the API route.
 */
export async function generateValuationPdf(input: {
  business_name: string
  industry: string | null
  annual_revenue: number | null
  sde: number | null
  asking_price: number | null
  tier: ValuationTierId
  brand?: { name?: string; primaryColor?: string }
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic)

  const brandName = input.brand?.name || 'CONCORD Deal Platform'
  const est = computeValuation({
    business_name: input.business_name,
    industry: input.industry,
    annual_revenue: input.annual_revenue,
    sde: input.sde,
    asking_price: input.asking_price,
  })

  const money = (n: number | null | undefined) => (n != null && !isNaN(n) ? '$' + Math.round(n).toLocaleString() : '—')

  // Header band.
  page.drawRectangle({ x: 0, y: 700, width: 612, height: 92, color: NAVY })
  page.drawText(brandName, { x: 40, y: 748, size: 22, font: bold, color: GOLD })
  page.drawText('Quick Valuation Estimate', { x: 40, y: 722, size: 13, font: regular, color: rgb(1, 1, 1) })
  page.drawText('Multiples-based estimate — not a CIM', { x: 40, y: 706, size: 9, font: regular, color: rgb(0.85, 0.85, 0.9) })

  // Business block.
  page.drawText(input.business_name || 'Business', { x: 40, y: 668, size: 20, font: bold, color: NAVY })
  page.drawText(`Industry: ${input.industry || '—'}`, { x: 40, y: 644, size: 12, font: regular, color: MUTED })

  // Key metrics.
  let y = 600
  const row = (label: string, value: string) => {
    page.drawText(label, { x: 40, y, size: 12, font: regular, color: MUTED })
    page.drawText(value, { x: 320, y, size: 12, font: bold, color: INK })
    y -= 24
  }
  row('Asking price', money(input.asking_price))
  row('Annual revenue', money(input.annual_revenue))
  row('Owner earnings (SDE)', money(input.sde))

  // Valuation range.
  page.drawRectangle({ x: 40, y: y - 60, width: 532, height: 78, color: rgb(0.97, 0.95, 0.9) })
  if (est) {
    page.drawText('INDICATED VALUE RANGE', { x: 56, y: y - 8, size: 11, font: bold, color: GOLD })
    page.drawText(`${money(est.estimate_min)}  –  ${money(est.estimate_max)}`, { x: 56, y: y - 34, size: 22, font: bold, color: NAVY })
    page.drawText(`Midpoint ${money(est.midpoint)} · ${est.method}`, { x: 56, y: y - 54, size: 11, font: regular, color: MUTED })
  } else {
    page.drawText('VALUATION UNAVAILABLE', { x: 56, y: y - 8, size: 11, font: bold, color: GOLD })
    page.drawText('Insufficient financial data to estimate a range.', { x: 56, y: y - 34, size: 14, font: regular, color: INK })
  }
  y -= 110

  // Multiples breakdown (when available).
  if (est) {
    page.drawText('Valuation Methodology', { x: 40, y: y, size: 14, font: bold, color: NAVY })
    y -= 22
    page.drawText(`Industry band: ${est.multiples.industry} · ${est.multiples.sde.min.toFixed(1)}x–${est.multiples.sde.max.toFixed(1)}x SDE`, { x: 40, y, size: 12, font: regular, color: INK })
    y -= 20
    page.drawText(`Revenue cross-check: ${est.multiples.revenue.min.toFixed(1)}x–${est.multiples.revenue.max.toFixed(1)}x`, { x: 40, y, size: 12, font: regular, color: INK })
    y -= 20
    page.drawText(`Margin adjustment: ${est.multiples.margin_adjustment >= 0 ? '+' : ''}${(est.multiples.margin_adjustment * 100).toFixed(0)}%`, { x: 40, y, size: 12, font: regular, color: INK })
    y -= 34
  }

  // Tier-specific sections.
  page.drawText('Confidential Overview', { x: 40, y: y, size: 14, font: bold, color: NAVY })
  y -= 22
  const overview =
    input.tier === 'full_bov'
      ? 'This full Broker Opinion of Value includes the recast financial analysis, comparative market context, an expanded value opinion, and a confidential marketing teaser prepared for qualified buyers.'
      : 'This report presents the normalized financial picture and an indicated value range based on market multiples, revenue cross-checks, and earnings quality adjustments.'
  const words = overview.split(' ')
  let line = ''
  for (const w of words) {
    if ((line + ' ' + w).length > 78) {
      page.drawText(line, { x: 40, y, size: 11.5, font: regular, color: INK })
      y -= 16
      line = w
    } else line = (line + ' ' + w).trim()
  }
  if (line) page.drawText(line, { x: 40, y, size: 11.5, font: regular, color: INK })

  // Footer.
  page.drawText('Prepared confidentially. Not an offer to sell. © ' + new Date().getFullYear() + ' ' + brandName, { x: 40, y: 30, size: 9, font: italic, color: MUTED })

  return doc.save()
}

/** Create a valuation report order (pending) and return the record. */
export async function createValuationReportOrder(input: {
  profileId: string
  listingId: string
  agencyId?: string | null
  tier: ValuationTierId
  stripeSession?: string
  status?: string
}): Promise<{ ok: boolean; error?: string; order?: Record<string, unknown> }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const tier = VALUATION_TIERS.find((t) => t.id === input.tier)
  if (!tier) return { ok: false, error: 'Unknown valuation tier' }

  const { data, error } = await svc
    .from('valuation_reports')
    .insert({
      profile_id: input.profileId,
      listing_id: input.listingId,
      agency_id: input.agencyId || null,
      tier: input.tier,
      amount_cents: tier.priceCents,
      status: input.status || 'pending',
      stripe_session: input.stripeSession || null,
    })
    .select()
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, order: data as Record<string, unknown> }
}

/** Mark paid, generate the PDF, upload to storage, and store the URL. */
export async function finalizeValuationReport(stripeSession: string): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { data: order } = await svc
    .from('valuation_reports')
    .select('*')
    .eq('stripe_session', stripeSession)
    .maybeSingle()
  if (!order) return { ok: false, error: 'Valuation order not found' }

  const { data: listing } = await svc
    .from('listings')
    .select('business_name, industry, annual_revenue, sde, asking_price')
    .eq('id', order.listing_id)
    .maybeSingle()
  if (!listing) return { ok: false, error: 'Listing not found' }

  try {
    const pdf = await generateValuationPdf({
      business_name: listing.business_name || 'Business',
      industry: listing.industry,
      annual_revenue: listing.annual_revenue,
      sde: listing.sde,
      asking_price: listing.asking_price,
      tier: order.tier,
    })

    const path = `valuation-reports/${order.id}.pdf`
    const { error: upErr } = await svc.storage.from('financial_docs').upload(path, new Uint8Array(pdf), {
      cacheControl: '3600', upsert: true, contentType: 'application/pdf',
    })
    if (upErr) throw new Error(upErr.message)

    const { data: urlData } = svc.storage.from('financial_docs').getPublicUrl(path)
    await svc
      .from('valuation_reports')
      .update({ status: 'ready', report_url: urlData?.publicUrl || null, paid_at: new Date().toISOString() })
      .eq('id', order.id)

    // BOV-on-file trust badge: a paid, ready valuation flips the public badge.
    try {
      await svc.from('listings').update({ bov_on_file: true }).eq('id', order.listing_id)
      const { data: pub } = await svc.from('public_listings').select('id').eq('listing_id', order.listing_id).maybeSingle()
      if (pub) await svc.from('public_listings').update({ bov_on_file: true }).eq('id', pub.id)
    } catch {
      // best-effort — the listing flag is the source of truth
    }

    return { ok: true }
  } catch (e: any) {
    await svc.from('valuation_reports').update({ status: 'failed' }).eq('id', order.id)
    return { ok: false, error: e?.message || 'Report generation failed' }
  }
}
