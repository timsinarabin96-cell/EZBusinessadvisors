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
import { assessLegitimacy, type LegitimacyReport } from '@/lib/listingLegitimacy'
import { normalizeLegalChecklist, evaluateLegalChecklist, LEGAL_DOC_REQUIREMENTS, type LegalDocId } from '@/lib/legalChecklist'
import { bestStockImage } from '@/lib/stockImages'

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
      const recipientEmails = new Set<string>()
      // The actual seller (owner self-service) gets the go-live news directly.
      const ownerEmail = (listing as { owner_email?: string | null }).owner_email || null
      if (ownerEmail) recipientEmails.add(ownerEmail)
      const { data: members } = await svc!.from('agency_members').select('profile_id, role, is_owner').eq('agency_id', agencyId)
      const ids = (members || []).filter((m) => m.is_owner || m.role === 'admin').map((m) => m.profile_id)
      if (ids.length) {
        const { data: profiles } = await svc!.from('profiles').select('email').in('id', ids)
        for (const p of profiles || []) if (p.email) recipientEmails.add(p.email)
      }
      for (const to of recipientEmails) {
        await sendEmail({
          to,
          subject: `🚀 ${listing.business_name || 'A listing'} is live on the marketplace`,
          html: `<h2>Your listing is live 🔥</h2><p><strong>${listing.business_name || 'Your listing'}</strong> is now public on the Concord marketplace. Buyer-match alerts have been fired.</p>`,
          kind: 'deal_notification',
        }).catch(() => {})
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
  ok: boolean; error?: string; blocked?: boolean; score?: number; missing?: string[]; published?: boolean; flagged?: boolean; compliance?: import('@/lib/compliance').ComplianceEvaluation; trainingGate?: { required: boolean; satisfied: boolean; moduleId: string; moduleTitle: string }; risk?: { score: number; level: string; reasons: string[] } | null; sellerApproval?: { approved: boolean; reference: string | null }; legalGate?: { checklist: string[]; satisfied: string[]; missing: { id: string; label: string }[] }; legitimacy?: LegitimacyReport | null
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

  // ── LEGITIMACY GATE (AI-first anti-scam / anti-premature) ────────────────
  // Boss's rule: "we don't want premature businesses or scam listings".
  // Requires 3+ years in business, 3 years of financials on file, a plausible
  // revenue trend, and a low scam-risk score. Verdicts:
  //   auto_approved  → publish proceeds (goes active)
  //   broker_review  → queued for human review in /dashboard/review-queue
  //   pending        → financials missing → blocked until uploaded
  //   rejected       → premature/scam → never goes live
  let risk: RiskReport | null = null
  let legitimacy: LegitimacyReport | null = null
  let sellerVerified = false
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
      alreadyFlagged: readiness.score < PUBLISH_READINESS_MIN,
      flagReasons: readiness.score < PUBLISH_READINESS_MIN ? ['low_readiness'] : null,
    })
    legitimacy = assessLegitimacy({
      establishedYear: listing.established_year,
      revenueYear1: listing.revenue_year_1,
      revenueYear2: listing.revenue_year_2,
      revenueYear3: listing.revenue_year_3,
      scamScore: risk.score,
      financialsStatus: listing.financials_status,
    })
    await svc
      .from('listings')
      .update({ legitimacy_score: legitimacy.score, legitimacy_verdict: legitimacy.verdict, ai_reviewed_at: new Date().toISOString() })
      .eq('id', listingId)
  } catch {
    risk = null
    legitimacy = null // best-effort — never hard-fail a publish on a DB hiccup
  }

  // ── OWNER IDENTITY GATE (legal shield) ───────────────────────────────────
  // Owner self-service listings require a verified profile: phone verified,
  // profile photo, and the seller attestation on the listing. This is the
  // anti-fake-account layer — no verified identity, no live listing.
  if (listing.owner_email && !force) {
    const { data: ownerProfile } = await svc
      .from('profiles')
      .select('email, phone_verified_at, avatar_url')
      .eq('email', listing.owner_email)
      .maybeSingle()
    const missing: string[] = []
    if (!ownerProfile?.phone_verified_at) missing.push('Verify your phone number (Owner Portal → Complete your profile)')
    if (!ownerProfile?.avatar_url) missing.push('Upload a profile photo (Owner Portal → Complete your profile)')
    if (!listing.attestation_accepted_at) missing.push('Accept the listing terms & risk disclosure (seller attestation)')
    if (missing.length) {
      return {
        ok: false, blocked: true, score: readiness.score,
        missing: [...(readiness.missing || []), ...missing],
        error: `Identity gate: ${missing[0]}`,
      }
    }
    sellerVerified = true
  }

  if (!force && legitimacy && legitimacy.verdict !== 'auto_approved') {
    const reasons = legitimacy.reasons
    if (legitimacy.verdict === 'broker_review') {
      // Human review: leave in draft, move to the broker review queue.
      try {
        await svc.from('listings').update({ review_stage: 'pending_review' }).eq('id', listingId)
      } catch {
        // best-effort — the block response below is the source of truth
      }
      return {
        ok: false, blocked: true, score: readiness.score,
        missing: [...(readiness.missing || []), ...reasons],
        error: `Legitimacy gate: ${reasons[0]} — queued for broker review.`,
      }
    }
    return {
      ok: false, blocked: true, score: readiness.score,
      missing: [...(readiness.missing || []), ...reasons],
      error: `Legitimacy gate: ${reasons[0]}${legitimacy.verdict === 'pending' ? ' — upload 3 years of P&L / tax returns in your owner dashboard to activate.' : ' This listing cannot go live.'}`,
    }
  }

  // ── SELLER-APPROVAL GATE ───────────────────────────────────────────────
  // Publishing requires the seller to have ACTUALLY approved — a signed
  // seller document (via the Deal Docs portal) or a recorded approval
  // reference. No more auto-stamped "approved" on publish. Compliance win.
  const approval = await sellerApprovalState(listing)
  if (!force && !approval.approved) {
    return {
      ok: false,
      blocked: true,
      score: readiness.score,
      missing: [
        ...(readiness.missing || []),
        'Seller approval required — send the Listing/Marketing Agreement for signature and have the seller sign in the portal (Deal Docs → Send for signature)',
      ],
      error: 'Seller approval required before publishing. Use Deal Docs & eSign → Send for signature, then the seller signs via the emailed portal link.',
      sellerApproval: approval,
    }
  }

  // ── LEGAL-DOC GATE (#4, spec §5) — the per-agency CONFIGURABLE checklist.
  // Every tier, no exceptions: a listing cannot go live until the agency's
  // configured legal docs (default Marketing Agreement + LLC Resolution) are
  // on file. Not hardcoded — read from agency_settings.legal_doc_checklist.
  if (!force) {
    const legalGate = await evaluateLegalGateForListing(listing)
    if (legalGate.missing.length > 0) {
      return {
        ok: false,
        blocked: true,
        score: readiness.score,
        missing: [
          ...(readiness.missing || []),
          `Legal gate: missing ${legalGate.missing.map((m) => m.label).join(', ')} — required before go-live.`,
        ],
        error: `Legal gate: ${legalGate.missing.map((m) => m.label).join(', ')} must be on file before this listing can go live (per this agency's required-docs checklist).`,
        legalGate,
      }
    }
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
      seller_verified: sellerVerified || undefined,
    })
    .eq('id', listingId)
  if (error) return { ok: false, error: error.message }

  // CRITICAL: create/update the public_listings row the public feed reads from.
  // Without this, a published listing never appears on the website.
  await syncPublicListingRow(listing, approval.approved ? approval : { approved: true, reference: 'force-publish' })

  // Critical-risk listings (>= 75) get auto-flagged for admin review even on
  // the successful path — before they can sit in the marketplace unflagged.
  if (risk && risk.score >= 75 && !flagged) {
    await svc.from('listings').update({ flagged: true, flag_reasons: [`AI: ${risk.score}/100 — ${risk.reasons.slice(0, 3).join('; ')}`] }).eq('id', listingId)
  }

  await firePublishBlast(listingId, listing.agency_id)
  return { ok: true, published: true, score: readiness.score, flagged, compliance, risk: risk ? { score: risk.score, level: risk.level, reasons: risk.reasons } : null, legitimacy: legitimacy ? { verdict: legitimacy.verdict, score: legitimacy.score, reasons: legitimacy.reasons } : null }
}

/** Ensure the public feed row exists for a published listing. */
async function syncPublicListingRow(listing: any, approval?: { approved: boolean; reference: string | null }): Promise<void> {
  if (!svc) return
  const now = new Date().toISOString()
  const slugBase = String(listing.business_name || listing.headline || 'business')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60)
  const slug = `${slugBase || 'business'}-${String(listing.id).slice(0, 8)}`
  const isFull = listing.confidentiality_level === 'full'
  const row = {
    listing_id: listing.id,
    slug,
    public_title: listing.ai_metadata?.public_title || listing.headline || listing.business_name || null,
    public_summary: listing.ai_metadata?.public_summary || (listing.description ? String(listing.description).slice(0, 600) : null),
    public_highlights: Array.isArray(listing.ai_metadata?.public_highlights)
      ? listing.ai_metadata.public_highlights
      : Array.isArray(listing.public_highlights)
        ? listing.public_highlights
        : [],
    gallery_json: (() => {
      const imgs = Array.isArray(listing.image_urls) ? listing.image_urls : []
      if (imgs.length > 0) return imgs
      // No photos → seed the public feed with the best real industry stock photo
      // (e.g. a bakery photo for "Bakery Cafe") instead of an empty gallery.
      const stock = bestStockImage(listing.sub_industry, listing.industry)
      return stock ? [stock] : []
    })(),
    published: true,
    published_at: now,
    is_confidential: !isFull,
    show_financials: isFull || Boolean(listing.ai_metadata?.show_financials),
    location_exposure: 'general',
    seller_approved_at: approval?.approved ? now : null,
    seller_approval_reference: approval?.approved ? (approval.reference || 'portal-signed') : null,
    seller_verified: Boolean(listing.seller_verified),
  }
  const { data: existing } = await svc.from('public_listings').select('id').eq('listing_id', listing.id).maybeSingle()
  if (existing) {
    await svc.from('public_listings').update(row).eq('listing_id', listing.id)
  } else {
    await svc.from('public_listings').insert(row)
  }
}

/**
 * True when the seller has actually approved the listing: a signed
 * seller-role signature on any document for the listing (portal eSign), or
 * an explicit seller_approval_reference recorded during intake. Never throws.
 */
/**
 * #4 legal-doc gate: resolve the agency's CONFIGURED checklist and evaluate
 * it against the listing's on-file + generated docs. Never zeroed — the two
 * mandatory defaults (Marketing Agreement, LLC Resolution) always apply.
 */
async function evaluateLegalGateForListing(listing: any): Promise<{
  checklist: string[]
  satisfied: string[]
  missing: { id: string; label: string }[]
}> {
  const empty = { checklist: [], satisfied: [], missing: [] }
  if (!svc) return empty
  try {
    // Resolve the agency's configured checklist (defaults when unset).
    let checklist: string[] = []
    const agencyId = listing?.agency_id
    if (agencyId) {
      const { data: settings } = await svc.from('agency_settings').select('legal_doc_checklist').eq('agency_id', agencyId).maybeSingle()
      checklist = normalizeLegalChecklist(settings?.legal_doc_checklist)
    }
    if (checklist.length === 0) checklist = normalizeLegalChecklist(null)

    // Gather on-file + generated docs — WITH signature status. The gate only
    // counts SIGNED docs (boss 08-31: "on file" ≠ "signed"; an uploaded-but-
    // unsigned scan must not unlock go-live, same risk class as the BOV gate).
    const [{ data: uploads }, { data: generated }] = await Promise.all([
      svc.from('listing_documents').select('category, body_text, status').eq('listing_id', listing?.id),
      svc.from('documents').select('title, status').eq('listing_id', listing?.id),
    ])
    const evalRes = evaluateLegalChecklist(
      checklist as LegalDocId[],
      (uploads || []) as { category?: string | null; body_text?: string | null; status?: string | null }[],
      (generated || []) as { title?: string | null; status?: string | null }[],
    )
    return {
      checklist,
      satisfied: evalRes.satisfied,
      missing: evalRes.missing.map((id) => ({ id, label: LEGAL_DOC_REQUIREMENTS[id]?.label || id })),
    }
  } catch {
    return empty
  }
}

async function sellerApprovalState(listing: any): Promise<{ approved: boolean; reference: string | null }> {
  if (!svc) return { approved: false, reference: null }
  try {
    const manualRef = String(listing?.ai_metadata?.seller_approval_reference || '').trim()
    if (manualRef) return { approved: true, reference: manualRef }

    const { data: docs } = await svc.from('documents').select('id').eq('listing_id', listing?.id)
    const ids = (docs || []).map((d: any) => d.id)
    if (ids.length === 0) return { approved: false, reference: null }

    const { data: sigs } = await svc
      .from('document_signatures')
      .select('id, signed_at')
      .eq('role', 'seller')
      .eq('status', 'signed')
      .in('document_id', ids)
      .limit(1)
    if ((sigs || []).length > 0) {
      return { approved: true, reference: 'portal-signed' }
    }
    return { approved: false, reference: null }
  } catch {
    return { approved: false, reference: null }
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
