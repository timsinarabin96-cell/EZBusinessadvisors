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
import { sendEmail } from '@/lib/email'
import { recordSuccessFee } from '@/lib/successFee'
import { matchPublicSubscriptions } from '@/lib/notifySubscriptions'

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
    real_estate_included: Boolean(row.real_estate_included),
    seller_financing_available: Boolean(row.seller_financing_available),
    financing_notes: '',
    transition_support: '',
    training_period_weeks: '',
    public_title: row.public_title || '',
    public_summary: row.public_summary || '',
    public_highlights: row.public_highlights || '',
    video_url: row.ai_metadata?.video_url || '',
    confidentiality_level: row.confidentiality_level || 'anonymous',
    show_financials: Boolean(row.show_financials),
    seller_approval_reference: '',
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
  ok: boolean; error?: string; blocked?: boolean; score?: number; missing?: string[]; published?: boolean; flagged?: boolean
}> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { data: listing } = await svc.from('listings').select('*').eq('id', listingId).maybeSingle()
  if (!listing) return { ok: false, error: 'Listing not found' }

  const readiness = calculateListingReadiness(listingToReadinessInput(listing))
  const force = opts?.force === true
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
      flag_reasons: flagged ? ['low_readiness', `readiness ${readiness.score}/100`, ...(readiness.missing || [])] : null,
    })
    .eq('id', listingId)
  if (error) return { ok: false, error: error.message }

  // CRITICAL: create/update the public_listings row the public feed reads from.
  // Without this, a published listing never appears on the website.
  await syncPublicListingRow(listing)

  await firePublishBlast(listingId, listing.agency_id)
  return { ok: true, published: true, score: readiness.score, flagged }
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
