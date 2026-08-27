/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Publish pipeline — quality gate + publish blast + lifecycle.
// -----------------------------------------------------------------------------
// 1) Quality gate: a listing must score >= 70 on calculateListingReadiness
//    before it can go live. Blocks thin listings and reports what's missing.
// 2) Publish blast: on going live, fire buyer-match alerts, notify the seller
//      + agency team, queue the newspaper, log activity. (No auto-push to
//      external marketplaces — agents syndicate manually to their own sources.)
// 3) Lifecycle: under_contract / sold transitions update the feed and auto-
//    record the success fee on close.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { calculateListingReadiness, type IntelligentListingInput } from '@/lib/listingIntelligence'
import { runWatchlistMatching } from '@/lib/watchlist'
import { createNotification, notifyMatch } from '@/lib/notifications'
import { fireDealRadar } from '@/lib/dealRadar'
import { evaluateListingCompliance } from '@/lib/compliance'
import { sendEmail } from '@/lib/email'
import { recordSuccessFee } from '@/lib/successFee'
import { matchPublicSubscriptions } from '@/lib/notifySubscriptions'
import { assessListingRisk, type RiskReport } from '@/lib/scamDetectionCore'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export const PUBLISH_READINESS_MIN = 70
export const VETTED_READINESS_MIN = 85

/** Build an IntelligentListingInput from a listings row for readiness scoring. */
export function listingToReadinessInput(row: any): IntelligentListingInput {
  return {
    business_name: row.business_name || '',
    headline: row.headline || '',
    industry: row.industry || '',
    sub_industry: row.sub_industry || '',
    location_general: row.location_general || '',
    description: row.description || '',
    asking_price: row.asking_price != null ? String(row.asking_price) : '',
    annual_revenue: row.annual_revenue != null ? String(row.annual_revenue) : '',
    sde: row.sde != null ? String(row.sde) : '',
    ebitda: row.ebitda != null ? String(row.ebitda) : '',
    inventory_value: row.inventory_value != null ? String(row.inventory_value) : '',
    ffe_value: row.ffe_value != null ? String(row.ffe_value) : '',
    established_year: row.year_established != null ? String(row.year_established) : '',
    employees_full_time: row.num_employees_ft != null ? String(row.num_employees_ft) : '',
    employees_part_time: row.num_employees_pt != null ? String(row.num_employees_pt) : '',
    owner_hours_weekly: row.owner_hours_weekly != null ? String(row.owner_hours_weekly) : '',
    reason_for_sale: row.reason_for_sale || '',
    growth_opportunities: row.growth_opportunities || '',
    competitive_advantages: row.competitive_advantages || '',
    customer_concentration: '',
    facilities_summary: row.facilities_summary || row.property_description || '',
    lease_monthly: row.monthly_rent != null ? String(row.monthly_rent) : '',
    lease_expires_on: '',
    lease_square_feet: row.lease_square_feet != null ? String(row.lease_square_feet) : '',
    real_estate_included: Boolean(row.real_estate_included),
    ffe_included: Boolean(row.ffe_included),
    inventory_included: Boolean(row.inventory_included),
    goodwill_included: Boolean(row.goodwill_included),
    asset_sale: row.asset_sale !== false,
    property_address: row.property_address || '',
    property_city: row.property_city || '',
    square_footage: row.square_footage != null ? String(row.square_footage) : '',
    land_acres: row.land_acres != null ? String(row.land_acres) : '',
    year_built: row.year_built != null ? String(row.year_built) : '',
    property_value: row.property_value != null ? String(row.property_value) : '',
    property_description: row.property_description || '',
    seller_financing_available: Boolean(row.seller_financing_available),
    financing_notes: '',
    commission_split_agent: typeof row.commission_split_agent === 'number' ? row.commission_split_agent : 50,
    commission_split_brokerage: typeof row.commission_split_brokerage === 'number' ? row.commission_split_brokerage : 50,
    transition_support: row.transition_support || row.ai_metadata?.transition_support || '',
    training_period_weeks: row.training_period_weeks != null ? String(row.training_period_weeks) : '',
    public_title: row.ai_metadata?.public_title || row.public_title || '',
    public_summary: row.ai_metadata?.public_summary || row.public_summary || '',
    public_highlights: Array.isArray(row.ai_metadata?.public_highlights)
      ? row.ai_metadata.public_highlights.join('\n')
      : row.ai_metadata?.public_highlights || row.public_highlights || '',
    video_url: row.ai_metadata?.video_url || '',
    gallery_images: Array.isArray(row.image_urls) ? row.image_urls : [],
    contact_phone: row.contact_phone || '',
    confidentiality_level: row.confidentiality_level || 'anonymous',
    show_financials: Boolean(row.ai_metadata?.show_financials ?? row.show_financials),
    seller_approval_reference: row.ai_metadata?.seller_approval_reference || '',
    source: 'broker_manual',
  }
}

/** Readiness check for a listing id. Returns score, label, and missing items. */
export async function getListingReadiness(listingId: string): Promise<{ ok: boolean; error?: string; score?: number; label?: string; missing?: string[] }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { data: listing } = await svc.from('listings').select('*').eq('id', listingId).maybeSingle()
  if (!listing) return { ok: false, error: 'Listing not found' }
  const result = calculateListingReadiness(listingToReadinessInput(listing))
  return { ok: true, score: result.score, label: result.label, missing: result.missing }
}

/** Internal: fire the full publish blast (no gate — call publishListing instead). */
async function firePublishBlast(listingId: string, agencyId: string): Promise<void> {
  // Deal Radar: match active buyer profiles and alert the top fits by email.
  try { await fireDealRadar(listingId) } catch { /* best-effort */ }
  try { await runWatchlistMatching(listingId) } catch { /* best-effort */ }
  try {
    const { data: listing } = await svc!.from('listings').select('*').eq('id', listingId).maybeSingle()
    if (listing) {
      // Saved-search alerts: email every subscriber whose criteria matches.
      try {
        await matchPublicSubscriptions({
          id: listing.id,
          agency_id: listing.agency_id,
          business_name: listing.business_name,
          industry: listing.industry,
          sub_industry: listing.sub_industry,
          asking_price: listing.asking_price,
          sde: listing.sde,
        })
      } catch { /* best-effort */ }
      // Notify agency team (in-app).
      await notifyMatch(agencyId, listing.business_name || 'New listing', 100, `/dashboard/listings/${listingId}/edit`)
      // Email seller + agency admins.
      const { data: members } = await svc!.from('agency_members').select('profile_id, role, is_owner').eq('agency_id', agencyId)
      const ids = (members || []).filter((m) => m.is_owner || m.role === 'admin').map((m) => m.profile_id)
      if (ids.length) {
        const { data: profiles } = await svc!.from('profiles').select('email').in('id', ids)
        const emails = (profiles || []).map((p) => p.email).filter(Boolean) as string[]
        for (const to of emails) {
          await sendEmail({
            to,
            subject: `🚀 ${listing.business_name || 'A listing'} is live on the marketplace`,
            html: `<h2>Your listing is live 🔥</h2><p><strong>${listing.business_name || 'Your listing'}</strong> is now public on the Concord marketplace. Buyer-match alerts have been fired.</p>`,
            kind: 'deal_notification',
          }).catch(() => {})
        }
      }
      // Other-source syndication is manual (agent-driven); no auto-push.
      // Agent may export/publish to external sites themselves.
    }
  } catch { /* best-effort */ }
}

/**
 * Publish a listing: readiness gate first, then flip to active + full blast.
 * Returns blocked with missing items when the gate fails.
 */
export async function publishListing(listingId: string, actorProfileId?: string, opts?: { force?: boolean }): Promise<{
  ok: boolean; error?: string; blocked?: boolean; score?: number; missing?: string[]; published?: boolean; flagged?: boolean; compliance?: import('@/lib/compliance').ComplianceEvaluation; trainingGate?: { required: boolean; satisfied: boolean; moduleId: string; moduleTitle: string }; risk?: { score: number; level: string; reasons: string[] } | null
}> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { data: listing } = await svc.from('listings').select('*').eq('id', listingId).maybeSingle()
  if (!listing) return { ok: false, error: 'Listing not found' }

  // Compliance evaluation — advisory jurisdiction check (license-required
  // flags + required disclosures). Surfaced in the publish response so the
  // broker sees the institutional-grade checklist at the moment of go-live.
  let compliance = null
  try {
    compliance = await evaluateListingCompliance(listing as import('@/lib/compliance').ListingComplianceInput)
  } catch {
    compliance = null
  }

  const readiness = calculateListingReadiness(listingToReadinessInput(listing))
  const force = opts?.force === true

  // Certification gate — publishing requires CBI Module 1 (Introduction to
  // Business Brokerage) completion. Training is the workflow: brokers who
  // haven't passed the core module can't go live (admins can force).
  const CBI_MODULE_1 = '11111111-1111-1111-1111-111111111101'
  let trainingGate: { required: boolean; satisfied: boolean; moduleId: string; moduleTitle: string } | null = null
  if (actorProfileId && !force) {
    try {
      const { data: moduleLessons } = await svc.from('training_lessons').select('id').eq('module_id', CBI_MODULE_1)
      if (moduleLessons && moduleLessons.length > 0) {
        const { data: progress } = await svc
          .from('training_progress')
          .select('lesson_id')
          .eq('broker_id', actorProfileId)
          .eq('completed', true)
        const done = new Set((progress || []).map((p: any) => p.lesson_id))
        const satisfied = moduleLessons.every((l: any) => done.has(l.id))
        trainingGate = {
          required: true,
          satisfied,
          moduleId: CBI_MODULE_1,
          moduleTitle: 'Introduction to Business Brokerage',
        }
      }
    } catch {
      trainingGate = null // gate is best-effort — never hard-fail on a DB hiccup
    }
  }

  if (trainingGate && !trainingGate.satisfied) {
    return {
      ok: false,
      blocked: true,
      score: readiness.score,
      missing: [...(readiness.missing || []), 'Complete CBI Module 1: Introduction to Business Brokerage to unlock publishing'],
      error: 'Certification gate: finish Module 1 training before publishing this listing.',
      trainingGate,
    }
  }

  if (!force && readiness.score < PUBLISH_READINESS_MIN) {
    return { ok: false, blocked: true, score: readiness.score, missing: readiness.missing, error: `Readiness ${readiness.score}/100 — below the ${PUBLISH_READINESS_MIN} publish threshold` }
  }

  // Premature / low-quality listings still go live on explicit Save, but get auto-flagged for review.
  const flagged = readiness.score < PUBLISH_READINESS_MIN
  const vetted = readiness.score >= VETTED_READINESS_MIN && Boolean(listing.revenue_verified)
  const { error } = await svc
    .from('listings')
    .update({
      status: 'active',
      review_stage: 'approved', // required by the public feed + enforce trigger
      published_at: new Date().toISOString(),
      publish_at: null,
      vetted,
      published_by: actorProfileId || null,
      flagged: flagged || undefined,
      flag_reasons: flagged ? ['low_readiness', `readiness ${readiness.score}/100`, ...(readiness.missing || [])] : [],
    })
    .eq('id', listingId)
  if (error) return { ok: false, error: error.message }

  // CRITICAL: create/update the public_listings row the public feed reads from.
  // Without this, a published listing never appears on the website.
  await syncPublicListingRow(listing)

  // Preventative AI risk gate: newly published listings get scored immediately;
  // critical risk (>= 75) auto-flags them for admin review — before they can
  // sit in the marketplace unflagged.
  let risk: RiskReport | null = null
  try {
    const { data: owner } = await svc.from('profiles').select('created_at').eq('id', listing.agent_id).maybeSingle()
    risk = assessListingRisk({
      businessName: listing.business_name,
      headline: listing.headline,
      description: listing.description,
      industry: listing.industry,
      askingPrice: listing.asking_price,
      annualRevenue: listing.annual_revenue,
      sde: listing.sde,
      city: listing.city,
      state: listing.state,
      imageCount: Array.isArray(listing.image_urls) ? listing.image_urls.length : 0,
      listingCreatedAt: listing.created_at,
      publishedAt: new Date().toISOString(),
      ownerCreatedAt: owner?.created_at || null,
      alreadyFlagged: Boolean(flagged),
      flagReasons: flagged ? ['low_readiness'] : null,
    })
    if (risk.score >= 75 && !flagged) {
      await svc.from('listings').update({ flagged: true, flag_reasons: [`AI: ${risk.score}/100 — ${risk.reasons.slice(0, 3).join('; ')}`] }).eq('id', listingId)
    }
  } catch {
    risk = null // risk gate is best-effort — never hard-fail a publish
  }

  await firePublishBlast(listingId, listing.agency_id)
  return { ok: true, published: true, score: readiness.score, flagged, compliance, risk: risk ? { score: risk.score, level: risk.level, reasons: risk.reasons } : null }
}

/** Ensure the public feed row exists for a published listing. */
async function syncPublicListingRow(listing: any): Promise<void> {
  if (!svc) return
  const now = new Date().toISOString()
  const slugBase = String(listing.business_name || listing.headline || 'business')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60)
  const slug = `${slugBase || 'business'}-${String(listing.id).slice(0, 8)}`
  const isFull = listing.confidentiality_level === 'full'
  const row = {
    listing_id: listing.id,
    slug,
    public_title: listing.headline || listing.business_name || null,
    public_summary: listing.description ? String(listing.description).slice(0, 600) : null,
    public_highlights: Array.isArray(listing.public_highlights) ? listing.public_highlights : [],
    gallery_json: Array.isArray(listing.image_urls) ? listing.image_urls : [],
    published: true,
    published_at: now,
    is_confidential: !isFull,
    show_financials: isFull,
    location_exposure: 'general',
    seller_approved_at: now,
    seller_approval_reference: 'auto-publish',
  }
  const { data: existing } = await svc.from('public_listings').select('id').eq('listing_id', listing.id).maybeSingle()
  if (existing) {
    await svc.from('public_listings').update(row).eq('listing_id', listing.id)
  } else {
    await svc.from('public_listings').insert(row)
  }
}

/** Schedule a listing to go live at a future time. */
export async function schedulePublish(listingId: string, publishAt: string): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { error } = await svc.from('listings').update({ publish_at: publishAt }).eq('id', listingId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Run the scheduled-publish sweep (cron). */
export async function processScheduledPublishes(): Promise<{ processed: number }> {
  if (!svc) return { processed: 0 }
  const { data } = await svc.rpc('process_scheduled_publishes')
  const processed = Number((data as any)?.processed || 0)
  // Fire blasts for anything that just went live (readiness was gated at schedule time).
  if (processed > 0) {
    const { data: listings } = await svc.from('listings').select('id, agency_id, status, published_at').eq('status', 'active').gte('published_at', new Date(Date.now() - 60_000).toISOString())
    for (const l of listings || []) await firePublishBlast(l.id, l.agency_id)
  }
  return { processed }
}

/**
 * Transition lifecycle: under_contract → badge; sold → record success fee.
 * Returns the new status.
 */
export async function transitionListing(listingId: string, newStatus: 'active' | 'under_contract' | 'sold' | 'pending_sale' | 'withdrawn'): Promise<{ ok: boolean; error?: string; fee?: Record<string, unknown> }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { data: listing } = await svc.from('listings').select('agency_id, asking_price').eq('id', listingId).maybeSingle()
  if (!listing) return { ok: false, error: 'Listing not found' }

  const { error } = await svc.from('listings').update({ status: newStatus }).eq('id', listingId)
  if (error) return { ok: false, error: error.message }

  // Sold → auto-record the platform's success fee (idempotent).
  let fee: Record<string, unknown> | undefined
  if (newStatus === 'sold' && listing.asking_price) {
    const res = await recordSuccessFee({
      agencyId: listing.agency_id,
      listingId,
      salePrice: Number(listing.asking_price),
      notes: 'Auto-recorded on sold transition',
    })
    if (res.ok && res.fee) fee = res.fee as unknown as Record<string, unknown>
  }
  return { ok: true, fee }
}
